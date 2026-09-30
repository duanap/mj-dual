// 房间与座位绑定：座位由服务端分配，客户端 action 一律不带有效座位（架构文档五；
// 2026-09-30 审查处置 P2 的服务端落地——原样转发客户端座位是漏洞，这里统一盖章）。
import { randomUUID } from 'node:crypto';
import type { Action, GameState, GangKind, RNG, Seat, Suit } from '@mj/engine';
import { RuleError, applyAction, availableActions, currentActors, newMatch, suggestAction } from '@mj/engine';
import { cryptoRng } from '@mj/engine/rng.node';
import { toPlayerView, type PlayerView } from '@mj/engine';
import type { GameEvent } from '@mj/engine';
import type { RoomControlResult, RoomGameView, RoomPhase, RoomSnapshot } from './protocol';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const EMPTY_TTL_MS = 10 * 60_000;
const DISCONNECT_AUTO_MS = 4_000;

export type SendFn = (seat: Seat, event: string, payload: unknown) => void;

export interface RoomOptions {
  /** 超时托管毫秒数（MJ_AUTO_MS 可覆盖；测试可调小） */
  autoMs?: number;
  /** 测试注入可复现随机源；生产默认 CSPRNG */
  rngFactory?: () => RNG;
}

function makeCode(): string {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_ALPHABET[randomUUID().charCodeAt(i * 3) % CODE_ALPHABET.length];
  return c;
}

function normalizeAction(raw: unknown): Action | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const a = raw as Record<string, unknown>;
  switch (a.type) {
    case 'discard':
      return typeof a.tileId === 'number' ? { type: 'discard', tileId: a.tileId } : null;
    case 'peng':
      return { type: 'peng' };
    case 'hu':
      return { type: 'hu' };
    case 'pass':
      return { type: 'pass' };
    case 'choose_flower':
      return a.suit === 'tong' || a.suit === 'tiao' ? { type: 'choose_flower', suit: a.suit as Suit } : null;
    case 'gang': {
      const kind = a.kind == null ? undefined : (a.kind as GangKind);
      return {
        type: 'gang',
        tileId: typeof a.tileId === 'number' ? a.tileId : undefined,
        kind: kind === 'ming' || kind === 'an' || kind === 'bu' ? kind : undefined,
      };
    }
    default:
      return null;
  }
}

function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'discard' && b.type === 'discard') return a.tileId === b.tileId;
  if (a.type === 'gang' && b.type === 'gang')
    return (a.tileId ?? null) === (b.tileId ?? null) && (a.kind ?? null) === (b.kind ?? null);
  if (a.type === 'choose_flower' && b.type === 'choose_flower') return a.suit === b.suit;
  return true;
}

/** 是否该座位当前可发的合法操作。 */
function isLegal(state: GameState, seat: Seat, action: Action): boolean {
  if (!currentActors(state).includes(seat)) return false;
  return availableActions(state, seat).some((a) => sameAction(a, action));
}

export class Room {
  readonly code: string;
  readonly tokens: [string, string];
  sids: [string | null, string | null] = [null, null];
  state: GameState | null = null;
  /** 每次状态推送携带的对局事件（客户端日志/音效用） */
  private lastEvents: GameEvent[] = [];
  private rng: RNG;
  private send: SendFn;
  private autoMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seat1Issued = false;
  private closed = false;
  emptySince: number | null = null;

  constructor(code: string, send: SendFn, opts: RoomOptions = {}) {
    this.code = code;
    this.send = send;
    this.autoMs = opts.autoMs ?? 20_000;
    this.rng = opts.rngFactory ? opts.rngFactory() : cryptoRng;
    this.tokens = [randomUUID(), randomUUID()];
  }

  view(seat: Seat): PlayerView {
    if (!this.state) throw new Error('房间尚未开始');
    return toPlayerView(this.state, seat, this.lastEvents);
  }

  snapshot(seat: Seat): RoomSnapshot {
    const state = this.state;
    const phase: RoomPhase = state == null ? 'waiting' : state.phase === 'settlement' ? 'finished' : 'playing';
    const view: RoomGameView | null = state == null ? null : omitReady(this.view(seat));
    const bothConnected = this.sids[0] != null && this.sids[1] != null;
    return {
      code: this.code,
      you: seat,
      host: 0,
      phase,
      members: [{ connected: this.sids[0] != null }, { connected: this.sids[1] != null }],
      round: state?.round ?? 0,
      tally: state?.tally ?? { wins: [0, 0], draws: 0 },
      view,
      canStart: seat === 0 && phase === 'waiting' && bothConnected,
      canRematch: seat === 0 && phase === 'finished' && bothConnected,
    };
  }

  start(seat: Seat, sid: string): RoomControlResult {
    const auth = this.authorizeHost(seat, sid);
    if (!auth.ok) return auth;
    if (this.state != null) return failure('WRONG_PHASE', '房间已经开始');
    if (!this.connected(1)) return failure('PLAYER_NOT_CONNECTED', '等待玩家加入并在线');
    this.state = newMatch(this.rng);
    this.lastEvents = [];
    this.pushState();
    this.armAuto();
    return { ok: true };
  }

  leavePlayer(seat: Seat, sid: string): RoomControlResult {
    if (seat !== 1) return failure('NOT_PLAYER', '只有玩家可以退出房间');
    if (this.sids[1] !== sid) return failure('STALE_SESSION', '房间连接已失效');
    this.sids[1] = null;
    this.tokens[1] = randomUUID();
    this.seat1Issued = false;
    this.state = null;
    this.lastEvents = [];
    this.disposeTimer();
    this.afterMembershipChange();
    return { ok: true };
  }

  dissolve(seat: Seat, sid: string): RoomControlResult {
    const auth = this.authorizeHost(seat, sid);
    if (!auth.ok) return auth;
    this.disposeTimer();
    this.closed = true;
    this.sids = [null, null];
    return { ok: true };
  }

  rematch(seat: Seat, sid: string): RoomControlResult {
    const auth = this.authorizeHost(seat, sid);
    if (!auth.ok) return auth;
    if (!this.state || this.state.phase !== 'settlement') return failure('WRONG_PHASE', '本局尚未结束');
    if (!this.connected(1)) return failure('PLAYER_NOT_CONNECTED', '等待玩家重新连接');

    let nextState = this.state;
    let events: GameEvent[] = [];
    try {
      for (const readySeat of [0, 1] as const) {
        if (nextState.ready[readySeat]) continue;
        const res = applyAction(nextState, { type: 'ready', seat: readySeat }, this.rng);
        nextState = res.state;
        events = res.events;
      }
    } catch (err) {
      if (err instanceof RuleError) return { ok: false, code: err.code, message: err.message };
      throw err;
    }

    this.state = nextState;
    this.lastEvents = events;
    this.pushState();
    this.armAuto();
    return { ok: true };
  }

  private authorizeHost(seat: Seat, sid: string): RoomControlResult {
    if (seat !== 0) return failure('NOT_HOST', '只有房主可以执行此操作');
    if (this.sids[0] !== sid) return failure('STALE_SESSION', '房间连接已失效');
    return { ok: true };
  }

  /** 连接绑定到座位；token 校验失败返回 null。顶掉旧连接时先通知它。 */
  bind(sid: string, seat: Seat, token: string): boolean {
    if (this.closed || this.tokens[seat] !== token) return false;
    if (seat === 1) this.seat1Issued = true; // 出示过 token 即视为已发放
    const prev = this.sids[seat];
    if (prev != null && prev !== sid) this.send(seat, 'room:kicked', {});
    this.sids[seat] = sid;
    this.afterMembershipChange();
    return true;
  }

  /** 发放座位 1（仅一次；之后只允许凭 token 重连，防止第三人顶号） */
  issueSeat1(): { seat: Seat; token: string } | null {
    if (this.seat1Issued) return null;
    this.seat1Issued = true;
    return { seat: 1, token: this.tokens[1] };
  }

  seatByToken(token: string): Seat | null {
    return this.tokens[0] === token ? 0 : this.tokens[1] === token ? 1 : null;
  }

  seatBySid(sid: string): Seat | null {
    return this.sids[0] === sid ? 0 : this.sids[1] === sid ? 1 : null;
  }

  /** 断开：清除绑定；返回房间是否已空 */
  unbind(sid: string): boolean {
    const seat = this.seatBySid(sid);
    if (seat == null) return this.isEmpty();
    this.sids[seat] = null;
    this.afterMembershipChange();
    return this.isEmpty();
  }

  private isEmpty(): boolean {
    return this.sids[0] == null && this.sids[1] == null;
  }

  private afterMembershipChange(): void {
    this.pushState();
    // 座位1尚未发放（房主刚创建）时不发在场事件，避免"对手掉线"的误导性提示
    if (this.seat1Issued) {
      for (const seat of [0, 1] as const) {
        const sid = this.sids[seat];
        if (sid) {
          this.send(seat, 'room:peer', {
            seat: (1 - seat) as Seat,
            connected: this.sids[(1 - seat) as Seat] != null,
          });
        }
      }
    }
    this.emptySince = this.isEmpty() ? (this.emptySince ?? Date.now()) : null;
    this.armAuto();
  }

  pushState(): void {
    for (const seat of [0, 1] as const) {
      if (this.sids[seat] == null) continue;
      this.send(seat, 'room:snapshot', this.snapshot(seat));
    }
    this.lastEvents = []; // 事件只随首次推送携带，成员变动等后续推送不再重发（防客户端日志/音效重复）
  }

  /** 客户端意图：座位一律服务端盖章；合法性先于引擎校验 */
  action(seat: Seat, raw: unknown): { ok: true } | { ok: false; code: string; message: string } {
    if (this.closed) return failure('ROOM_CLOSED', '房间已解散');
    if (!this.state) return failure('NOT_STARTED', '房间尚未开始');
    const parsed = normalizeAction(raw);
    if (parsed == null) return { ok: false, code: 'BAD_ACTION', message: '操作格式非法' };
    const action: Action = parsed.type === 'ready' ? { type: 'ready', seat } : parsed;
    if (!isLegal(this.state, seat, action)) {
      return { ok: false, code: 'ILLEGAL_ACTION', message: '当前不允许该操作' };
    }
    try {
      const res = applyAction(this.state, action, this.rng);
      this.state = res.state; // applyAction 是纯函数，必须接住新状态
      this.lastEvents = res.events;
    } catch (err) {
      if (err instanceof RuleError) return { ok: false, code: err.code, message: err.message };
      throw err;
    }
    this.pushState();
    this.armAuto();
    return { ok: true };
  }

  private connected(seat: Seat): boolean {
    return this.sids[seat] != null;
  }

  private armAuto(): void {
    if (this.timer) clearTimeout(this.timer);
    if (!this.state || this.state.phase === 'settlement') return; // 等待开始与结算状态都不自动推进
    if (this.isEmpty()) return; // 无人在线时冻结牌局，任意一方重连即自动恢复
    const anyDisconnected = !this.connected(0) || !this.connected(1);
    const delay = anyDisconnected ? DISCONNECT_AUTO_MS : this.autoMs;
    this.timer = setTimeout(() => this.autoStep(), delay);
  }

  /** 超时托管：对当前所有待操作座位代打建议操作（架构文档九） */
  private autoStep(): void {
    const s = this.state;
    if (!s || s.phase === 'settlement') return;
    for (const seat of currentActors(s)) {
      this.forceApply(suggestAction(s, seat, this.rng));
    }
  }

  private forceApply(action: Action): void {
    if (!this.state) return;
    try {
      const res = applyAction(this.state, action, this.rng);
      this.state = res.state;
      this.lastEvents = res.events;
    } catch (err) {
      // 托管建议与就绪都是当前状态下的合法操作；竞态（另一座位同时行动）下静默跳过本轮
      if (err instanceof RuleError) return;
      throw err;
    }
    this.pushState();
    this.armAuto();
  }

  emptyForMs(now: number): number {
    return this.isEmpty() && this.emptySince != null ? now - this.emptySince : 0;
  }

  dispose(): void {
    this.disposeTimer();
  }

  private disposeTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

function omitReady(view: PlayerView): RoomGameView {
  const { ready: _ready, ...gameView } = view;
  return gameView;
}

function failure(code: string, message: string): RoomControlResult {
  return { ok: false, code, message };
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  all(): Room[] {
    return [...this.rooms.values()];
  }

  size(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  remove(room: Room): boolean {
    if (this.rooms.get(room.code) !== room) return false;
    room.dispose();
    this.rooms.delete(room.code);
    return true;
  }

  create(send: SendFn, opts: RoomOptions = {}): Room {
    let code = makeCode();
    while (this.rooms.has(code)) code = makeCode();
    const room = new Room(code, send, opts);
    this.rooms.set(code, room);
    if (process.env.MJ_DEBUG_CREATE) console.error('[debug] room created:', code, new Error().stack);
    return room;
  }

  /** 周期清理：双端断开超过 TTL 的房间 */
  sweep(now = Date.now()): void {
    for (const [code, room] of this.rooms) {
      if (room.emptyForMs(now) > EMPTY_TTL_MS) {
        room.dispose();
        this.rooms.delete(code);
      }
    }
  }
}
