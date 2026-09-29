// 按玩家视角过滤的对局视图（架构文档五/九）：服务端唯一外发的状态形状。
// 原则：己方手牌完整；对手手牌只发数量；牌墙只发数量；摸牌张只有本人可见；
// 过张只发自己的；结算阶段才亮双方手牌。座位绑定由服务端完成，客户端不报座位。
import type { Action, GameEvent, GameState, Meld, Phase, RoundResult, Seat } from './types';
import type { Suit, Tile, TileCode } from './tile';
import { availableActions } from './engine';

export interface PlayerView {
  you: Seat;
  seq: number;
  round: number;
  phase: Phase;
  banker: Seat;
  turn: Seat;
  flowers: [Suit | null, Suit | null];
  melds: [Meld[], Meld[]];
  rivers: [Tile[], Tile[]];
  /** 自己的手牌（完整） */
  hand: Tile[];
  otherHandCount: number;
  wallCount: number;
  /** 仅当自己是当前摸牌者时携带（供 UI 高亮刚摸的牌） */
  drawnTile: Tile | null;
  pending: GameState['pending'];
  /** 自己的过张记录 */
  passTiles: TileCode[];
  ready: [boolean, boolean];
  result: RoundResult | null;
  tally: GameState['tally'];
  /** 结算阶段亮牌：双方完整手牌（其余阶段为 null） */
  reveal: [Tile[], Tile[]] | null;
  /** 服务端算好的本座位合法操作（前端只渲染按钮，架构文档九） */
  yourActions: Action[];
  /** 随本次推送携带的对局事件（日志/音效），无事件时为空数组 */
  events: GameEvent[];
}

export function toPlayerView(state: GameState, seat: Seat, events: GameEvent[] = []): PlayerView {
  const other = (1 - seat) as Seat;
  return {
    you: seat,
    seq: state.seq,
    round: state.round,
    phase: state.phase,
    banker: state.banker,
    turn: state.turn,
    flowers: state.flowers,
    melds: state.melds,
    rivers: state.rivers,
    hand: state.hands[seat],
    otherHandCount: state.hands[other].length,
    wallCount: state.wall.length,
    drawnTile: state.phase === 'act' && state.turn === seat ? state.drawnTile : null,
    pending: state.pending,
    passTiles: state.passTiles[seat],
    ready: state.ready,
    result: state.result,
    tally: state.tally,
    reveal: state.phase === 'settlement' ? state.hands : null,
    yourActions: state.phase === 'settlement' && !state.ready[seat] ? [{ type: 'ready', seat }] : availableActions(state, seat),
    events,
  };
}
