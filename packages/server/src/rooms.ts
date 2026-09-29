// 房间与座位绑定：座位由服务端分配，客户端 action 一律不带有效座位（架构文档五；
// 2026-09-30 审查处置 P2 的服务端落地——原样转发客户端座位是漏洞，这里统一盖章）。
import { randomUUID } from 'node:crypto';
import type { Action, GameState, GangKind, RNG, Seat, Suit } from '@mj/engine';
import { RuleError, applyAction, availableActions, currentActors, newMatch, suggestAction } from '@mj/engine';
import { cryptoRng } from '@mj/engine/rng.node';
import { toPlayerView, type PlayerView } from '@mj/engine';
import type { GameEvent } from '@mj/engine';

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
    case 'ready':
      // 座位由服务端盖章，客户端携带的 seat 一律忽略
      return { type: 'ready', seat: 0 };
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

/** 是否该座位当前可发的合法操作（ready 由服务端按座位另判） */
function isLegal(state: GameState, seat: Seat, action: Action): boolean {
  if (action.type === 'ready') return state.phase === 'settlement' && !state.ready[seat];
  if (!currentActors(state).includes(seat)) return false;
  return availableActions(state, seat).some((a) => sameAction(a, action));
}

export class Room {
  readonly code: string;
  readonly tokens: readonly [string, string];
  sids: [string | null, string | null] = [null, null];
  state: GameState;
  /** 每次状态推送携带的对局事件（客户端日志/音效用） */
  private lastEvents: GameEvent[] = [];
  private rng: RNG;
  private send: SendFn;
  private autoMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seat1Issued = false;
  /** 首次满员后开始计时；此后断线只缩短托管延时，不再停表 */
  private started = false;
  emptySince: number | null = null;

  constructor(code: string, send: SendFn, opts: RoomOptions = {}) {
    this.code = code;
    this.send = send;
    this.autoMs = opts.autoMs ?? 20_000;
    this.rng = opts.rngFactory ? opts.rngFactory() : cryptoRng;
    this.state = newMatch(this.rng);
    this.tokens = [randomUUID(), randomUUID()];
  }

  view(seat: Seat): PlayerView {
    return toPlayerView(this.state, seat, this.lastEvents);
  }

  /** 连接绑定到座位；token 校验失败返回 null */
  bind(sid: string, seat: Seat, token: string): boolean {
    if (this.tokens[seat] !== token) return false;
    if (seat === 1) this.seat1Issued = true; // 出示过 token 即视为已发放
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
    if (this.sids[0] != null && this.sids[1] != null) this.started = true;
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
      if (this.sids[seat] != null) this.send(seat, 'state', this.view(seat));
    }
  }

  /** 客户端意图：座位一律服务端盖章；合法性先于引擎校验 */
  action(seat: Seat, raw: unknown): { ok: true } | { ok: false; code: string; message: string } {
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
    if (!this.started) return; // 未满员不计时，等双方到齐才开始对局
    const anyDisconnected = !this.connected(0) || !this.connected(1);
    const delay = anyDisconnected ? DISCONNECT_AUTO_MS : this.autoMs;
    this.timer = setTimeout(() => this.autoStep(), delay);
  }

  /** 超时托管：对当前所有待操作座位代打建议操作（架构文档九） */
  private autoStep(): void {
    const s = this.state;
    if (s.phase === 'settlement') {
      for (const seat of [0, 1] as const) {
        if (!s.ready[seat]) this.forceApply({ type: 'ready', seat });
      }
      return;
    }
    for (const seat of currentActors(s)) {
      this.forceApply(suggestAction(s, seat, this.rng));
    }
  }

  private forceApply(action: Action): void {
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
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
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
