import type { Action, ActionResult, GameEvent, GameState, Seat } from './types';
import type { RNG } from './rng';
import { mulberry32 } from './rng';
import { deal } from './deal';
import { exchangeFlower } from './changeFlower';
import { canWin } from './hu';
import { claimsOn, findTileId, hasAnyClaim } from './claims';
import { settle, startNextRound } from './settlement';
import { codeOf, countCode, otherSuit, type Suit, type Tile } from './tile';

export class RuleError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * 开新对局。rng 由调用方注入：生产服务端必须传 cryptoRng（rng.node.ts）。
 * mulberry32 种子版全部内部状态仅 32 位、可按起手牌穷举反推整副牌序，仅限测试/模拟。
 */
export function newMatch(rng: RNG): GameState {
  const banker = rng.int(2) as Seat; // 规则二：首局随机庄
  const { hands, wall } = deal(rng, banker);
  return {
    round: 1,
    phase: 'choose_flower',
    banker,
    turn: banker,
    flowers: [null, null],
    hands,
    melds: [[], []],
    rivers: [[], []],
    wall,
    drawnTile: null,
    claimable: false,
    pending: null,
    passTiles: [[], []],
    ready: [false, false],
    result: null,
    tally: { wins: [0, 0], draws: 0 },
    seq: 0,
  };
}

/**
 * 测试/工具用：用强制手牌构造牌局（消除发牌随机性）。
 * flower 给定时立即完成定花交换，直接进入 act 阶段。
 */
export function createMatchForTest(opts: {
  seed?: number;
  banker?: Seat;
  hands: [Tile[], Tile[]];
  flower?: Suit;
}): GameState {
  const rng = mulberry32(opts.seed ?? 1);
  const banker = opts.banker ?? 0;
  const { hands, wall } = deal(rng, banker, { hands: opts.hands });
  const state: GameState = {
    round: 1,
    phase: 'choose_flower',
    banker,
    turn: banker,
    flowers: [null, null],
    hands,
    melds: [[], []],
    rivers: [[], []],
    wall,
    drawnTile: null,
    claimable: false,
    pending: null,
    passTiles: [[], []],
    ready: [false, false],
    result: null,
    tally: { wins: [0, 0], draws: 0 },
    seq: 0,
  };
  if (opts.flower) {
    const events: GameEvent[] = [];
    chooseFlower(state, opts.flower, events);
  }
  return state;
}

function other(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

function requireCond(cond: boolean, code: string, message: string): void {
  if (!cond) throw new RuleError(code, message);
}

function removeFromHand(hand: Tile[], tileId: number): Tile {
  const idx = hand.findIndex((t) => t.id === tileId);
  requireCond(idx >= 0, 'INVALID_TILE', `手牌中没有 id=${tileId}`);
  return hand.splice(idx, 1)[0]!;
}

function removeByCode(hand: Tile[], code: string, n: number): Tile[] {
  const taken: Tile[] = [];
  for (let i = hand.length - 1; i >= 0 && taken.length < n; i--) {
    if (codeOf(hand[i]!) === code) taken.push(hand.splice(i, 1)[0]!);
  }
  requireCond(taken.length === n, 'INVALID_TILE', `手牌中 ${code} 不足 ${n} 张`);
  return taken;
}

function flowerOf(state: GameState, seat: Seat): Suit {
  const f = state.flowers[seat];
  if (f == null) throw new RuleError('INVALID_ACTION', '尚未定花');
  return f;
}

/** 轮到 seat 摸牌；牌墙空则流局（规则十四） */
function drawFor(state: GameState, seat: Seat, rng: RNG, events: GameEvent[]): void {
  if (state.wall.length === 0) {
    settle(state, { winner: null, kind: 'draw', reason: 'wall_empty' }, events);
    events.push({ type: 'draw_game', reason: 'wall_empty' });
    return;
  }
  const tile = state.wall.shift()!;
  state.hands[seat].push(tile);
  state.drawnTile = tile;
  state.claimable = true;
  state.passTiles[seat] = []; // 规则十二：自己摸牌后过张重置
  state.phase = 'act';
  state.turn = seat;
  events.push({ type: 'drawn', seat });
}

/** 杠后补牌（规则八）；需要补牌时牌墙为空则流局（规则八/十四）。补牌后回到该玩家操作节点（支持连杠）。 */
function replacementDraw(state: GameState, seat: Seat, rng: RNG, events: GameEvent[]): void {
  if (state.wall.length === 0) {
    settle(state, { winner: null, kind: 'draw', reason: 'gang_no_replacement' }, events);
    events.push({ type: 'draw_game', reason: 'gang_no_replacement' });
    return;
  }
  const tile = state.wall.shift()!;
  state.hands[seat].push(tile);
  state.drawnTile = tile;
  state.claimable = true;
  state.passTiles[seat] = [];
  state.phase = 'act';
  state.turn = seat;
  events.push({ type: 'replacement_drawn', seat });
}

function settleWin(state: GameState, seat: Seat, kind: 'zimo' | 'dianpao', tile: Tile, events: GameEvent[]): void {
  events.push({ type: 'hu', seat, kind, tile });
  settle(state, { winner: seat, kind, tile }, events);
}

/** 待响应的牌从弃牌者牌河末尾移出（碰/明杠/点炮胡通用），保持 72 张守恒 */
function takeFromRiver(state: GameState, tile: Tile): void {
  const from = state.pending!.from;
  const river = state.rivers[from];
  requireCond(river.length > 0 && river[river.length - 1]!.id === tile.id, 'INVALID_ACTION', '牌河状态异常');
  river.pop();
}

function chooseFlower(state: GameState, suit: Suit, events: GameEvent[]): void {
  state.flowers[state.banker] = suit;
  state.flowers[other(state.banker)] = otherSuit(suit);
  const summary = exchangeFlower(state.hands, state.banker, suit);
  events.push({ type: 'flower_chosen', seat: state.banker, suit });
  events.push({ type: 'exchanged', ...summary });
  state.phase = 'act';
  state.turn = state.banker;
  state.drawnTile = null;
  state.claimable = true; // 开局 14 张允许直接暗杠
}

/**
 * 纯函数 reducer（架构文档七）：(state, action, rng) → (newState, events)。
 * 非法操作抛 RuleError，不改变传入的 state。
 * 客户端只发意图（架构文档五/十），本函数即"服务器判断真实状态"的落点。
 */
export function applyAction(state: GameState, action: Action, rng: RNG): ActionResult {
  const s = structuredClone(state);
  const events: GameEvent[] = [];

  switch (action.type) {
    case 'choose_flower': {
      requireCond(s.phase === 'choose_flower', 'WRONG_PHASE', '当前不在定花阶段');
      requireCond(s.turn === s.banker, 'NOT_YOUR_TURN', '只有庄家可以定花');
      requireCond(action.suit === 'tong' || action.suit === 'tiao', 'INVALID_ACTION', '花色只能是筒/条');
      chooseFlower(s, action.suit, events);
      break;
    }

    case 'discard': {
      requireCond(s.phase === 'act', 'WRONG_PHASE', '当前不能出牌');
      const seat = s.turn;
      const tile = removeFromHand(s.hands[seat], action.tileId);
      s.rivers[seat].push(tile);
      s.drawnTile = null;
      s.claimable = false;
      events.push({ type: 'discarded', seat, tile });
      const responder = other(seat);
      const claims = claimsOn(s, responder, tile);
      if (hasAnyClaim(claims)) {
        s.pending = { tile, from: seat };
        s.phase = 'respond';
        s.turn = responder;
      } else {
        drawFor(s, responder, rng, events);
      }
      break;
    }

    case 'peng': {
      const pending = s.phase === 'respond' ? s.pending : null;
      if (pending == null) throw new RuleError('WRONG_PHASE', '当前没有可响应的牌');
      const seat = s.turn;
      const tile = pending.tile;
      const claims = claimsOn(s, seat, tile);
      requireCond(claims.peng, 'INVALID_PENG', '不满足碰牌条件');
      // 牌从弃牌者的牌河移入碰组，保持全场守恒
      takeFromRiver(s, tile);
      const two = removeByCode(s.hands[seat], codeOf(tile), 2);
      s.melds[seat].push({ type: 'peng', code: codeOf(tile), tiles: [...two, tile], concealed: false, upgraded: false });
      s.pending = null;
      s.drawnTile = null;
      s.claimable = false; // 碰后只能出牌
      s.phase = 'act'; // 碰牌者接着出牌
      events.push({ type: 'peng', seat, tile });
      break;
    }

    case 'gang': {
      if (s.phase === 'respond') {
        // 明杠：对家打出的第四张（规则七）
        const pending = s.pending;
        if (pending == null) throw new RuleError('WRONG_PHASE', '当前没有可响应的牌');
        const seat = s.turn;
        const tile = pending.tile;
        const claims = claimsOn(s, seat, tile);
        requireCond(claims.gang, 'INVALID_GANG', '不满足明杠条件');
        takeFromRiver(s, tile); // 牌从牌河移入杠组
        const three = removeByCode(s.hands[seat], codeOf(tile), 3);
        s.melds[seat].push({ type: 'gang', code: codeOf(tile), tiles: [...three, tile], concealed: false, upgraded: false });
        s.pending = null;
        events.push({ type: 'gang', seat, kind: 'ming', tile });
        replacementDraw(s, seat, rng, events);
      } else {
        // 暗杠/补杠：自己回合内（规则七），只杠本家花色（规则九）
        requireCond(s.phase === 'act', 'WRONG_PHASE', '当前不能杠');
        requireCond(s.claimable, 'INVALID_GANG', '碰牌后须先出牌，不能杠');
        const seat = s.turn;
        const flower = flowerOf(s, seat);
        const hand = s.hands[seat];

        const anCodes = new Set<string>();
        const buCodes = new Set<string>();
        for (const t of hand) {
          const c = codeOf(t);
          if (t.suit === flower && countCode(hand, c) === 4) anCodes.add(c);
        }
        for (const m of s.melds[seat]) {
          if (m.type === 'peng' && countCode(hand, m.code) >= 1) buCodes.add(m.code);
        }

        let code: string;
        let kind = action.kind;
        if (action.tileId != null) {
          const tile = hand.find((t) => t.id === action.tileId);
          if (tile == null) throw new RuleError('INVALID_TILE', `手牌中没有 id=${action.tileId}`);
          requireCond(tile.suit === flower, 'INVALID_GANG', '只能杠本家花色（规则九）');
          code = codeOf(tile);
        } else {
          const all = [...new Set([...anCodes, ...buCodes])];
          requireCond(all.length === 1, 'AMBIGUOUS_GANG', '存在多个可杠目标，需指定 tileId');
          code = all[0]!;
        }
        const canAn = anCodes.has(code);
        const canBu = buCodes.has(code);
        requireCond(canAn || canBu, 'INVALID_GANG', '没有可杠的牌');
        // 同一 code 既可暗杠（手牌4张）又可补杠（已有碰+手里1张）时必须指定 kind
        if (!kind) kind = canAn && canBu ? undefined : canAn ? 'an' : 'bu';
        requireCond(kind != null, 'AMBIGUOUS_GANG', `${code} 同时可暗杠/补杠，需指定 kind`);

        if (kind === 'an') {
          requireCond(canAn, 'INVALID_GANG', `${code} 无法暗杠`);
          const four = removeByCode(hand, code, 4);
          s.melds[seat].push({ type: 'gang', code, tiles: four, concealed: true, upgraded: false });
          events.push({ type: 'gang', seat, kind: 'an', tile: four[0]! });
        } else {
          requireCond(kind === 'bu' && canBu, 'INVALID_GANG', `${code} 无法补杠`);
          const tile = removeFromHand(hand, findTileId(hand, code)!);
          const meld = s.melds[seat].find((m) => m.type === 'peng' && m.code === code)!;
          meld.type = 'gang';
          meld.tiles.push(tile);
          meld.upgraded = true; // 规则十三：补杠立即计入杠数量
          events.push({ type: 'gang', seat, kind: 'bu', tile });
        }
        replacementDraw(s, seat, rng, events);
      }
      break;
    }

    case 'hu': {
      if (s.phase === 'act') {
        // 自摸胡（规则十一）：仅摸牌后可宣言
        const seat = s.turn;
        const flower = flowerOf(s, seat);
        const drawn = s.drawnTile;
        if (!s.claimable || drawn == null) throw new RuleError('INVALID_HU', '当前不能自摸胡');
        requireCond(canWin(s.hands[seat], s.melds[seat], flower), 'INVALID_HU', '未构成胡牌牌型');
        settleWin(s, seat, 'zimo', drawn, events);
      } else {
        // 点炮胡（规则十一）
        const pending = s.phase === 'respond' ? s.pending : null;
        if (pending == null) throw new RuleError('WRONG_PHASE', '当前没有可响应的牌');
        const seat = s.turn;
        const tile = pending.tile;
        const claims = claimsOn(s, seat, tile);
        requireCond(claims.hu, 'INVALID_HU', '这张牌不能点炮胡');
        takeFromRiver(s, tile); // 胡牌张从弃牌者的牌河移入胡牌者手牌
        s.hands[seat].push(tile);
        s.pending = null;
        settleWin(s, seat, 'dianpao', tile, events);
      }
      break;
    }

    case 'pass': {
      const pending = s.phase === 'respond' ? s.pending : null;
      if (pending == null) throw new RuleError('WRONG_PHASE', '当前没有可响应的牌');
      const seat = s.turn;
      const tile = pending.tile;
      const claims = claimsOn(s, seat, tile);
      if (claims.hu) {
        // 规则十二：放弃点炮胡记过张，自己下次摸牌后重置（两人局中随即摸牌，语义保持完整以备扩展）
        s.passTiles[seat].push(codeOf(tile));
      }
      s.pending = null;
      drawFor(s, seat, rng, events);
      break;
    }

    case 'ready': {
      // action.seat 不可信：服务端必须按连接身份自行构造/覆盖座位后再调用 reducer，
      // 严禁原样转发客户端 action（否则玩家可替对手就绪、使下一局提前开始）。
      requireCond(s.phase === 'settlement', 'WRONG_PHASE', '本局尚未结束');
      requireCond(!s.ready[action.seat], 'ALREADY_READY', '该玩家已就绪');
      s.ready[action.seat] = true;
      if (s.ready[0] && s.ready[1]) startNextRound(s, rng, events);
      break;
    }
  }

  s.seq++;
  return { state: s, events };
}

/** 当前需要输入的玩家（sim / 服务端调度用） */
export function currentActors(state: GameState): Seat[] {
  if (state.phase === 'choose_flower') return [state.banker];
  if (state.phase === 'settlement') return ([0, 1] as Seat[]).filter((x) => !state.ready[x]);
  return [state.turn];
}

/**
 * seat 当前的合法操作列表（架构文档九：服务端算好 actions 下发，前端只渲染按钮）。
 * 发给客户端前仍需按玩家视角过滤（服务端职责）。
 */
export function availableActions(state: GameState, seat: Seat): Action[] {
  switch (state.phase) {
    case 'choose_flower':
      return seat === state.banker
        ? [
            { type: 'choose_flower', suit: 'tong' },
            { type: 'choose_flower', suit: 'tiao' },
          ]
        : [];

    case 'act': {
      if (seat !== state.turn) return [];
      const hand = state.hands[seat];
      const flower = state.flowers[seat];
      const actions: Action[] = [];
      if (state.claimable && state.drawnTile != null && flower && canWin(hand, state.melds[seat], flower)) {
        actions.push({ type: 'hu' });
      }
      if (flower && state.claimable) {
        // 暗杠：手牌 4 张同牌（去重）
        const anSeen = new Set<string>();
        for (const t of hand) {
          const c = codeOf(t);
          if (t.suit === flower && !anSeen.has(c) && countCode(hand, c) === 4) {
            anSeen.add(c);
            actions.push({ type: 'gang', tileId: t.id, kind: 'an' });
          }
        }
        // 补杠：已有碰 + 手里有第四张
        for (const m of state.melds[seat]) {
          if (m.type === 'peng' && countCode(hand, m.code) >= 1) {
            actions.push({ type: 'gang', tileId: findTileId(hand, m.code)!, kind: 'bu' });
          }
        }
      }
      // 出牌：按 code 去重（同 code 任一张等价）
      const seen = new Set<string>();
      for (const t of hand) {
        const c = codeOf(t);
        if (!seen.has(c)) {
          seen.add(c);
          actions.push({ type: 'discard', tileId: t.id });
        }
      }
      return actions;
    }

    case 'respond': {
      if (seat !== state.turn || !state.pending) return [];
      const claims = claimsOn(state, seat, state.pending.tile);
      const actions: Action[] = [];
      if (claims.hu) actions.push({ type: 'hu' });
      if (claims.gang) actions.push({ type: 'gang' });
      if (claims.peng) actions.push({ type: 'peng' });
      actions.push({ type: 'pass' });
      return actions;
    }

    case 'settlement':
      return state.ready[seat] ? [] : [{ type: 'ready', seat }];
  }
}
