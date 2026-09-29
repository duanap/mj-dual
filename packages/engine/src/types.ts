import type { Suit, Tile, TileCode } from './tile';

/** 座位：0 = 本局庄家侧编号（banker 字段才是真实庄家） */
export type Seat = 0 | 1;

/**
 * 牌局阶段（架构文档六）：
 * - choose_flower：等待庄家定花
 * - act：轮到 turn 玩家操作（出牌/自摸胡/暗杠/补杠）
 * - respond：等待 turn 玩家对 pending 牌响应（碰/明杠/点炮胡/过）
 * - settlement：本局结束，等待双方 next_round_ready
 */
export type Phase = 'choose_flower' | 'act' | 'respond' | 'settlement';

export type GangKind = 'ming' | 'an' | 'bu';

export interface Meld {
  type: 'peng' | 'gang';
  code: TileCode;
  tiles: Tile[];
  /** 暗杠 */
  concealed: boolean;
  /** 补杠（由碰升级） */
  upgraded: boolean;
}

export interface PendingClaim {
  tile: Tile;
  from: Seat;
}

export interface RoundResult {
  /** null = 流局 */
  winner: Seat | null;
  kind: 'zimo' | 'dianpao' | 'draw';
  /** 胡的那张牌 */
  tile?: Tile;
  reason?: 'wall_empty' | 'gang_no_replacement';
}

export interface Tally {
  wins: [number, number];
  draws: number;
}

export interface GameState {
  round: number;
  phase: Phase;
  banker: Seat;
  /** 当前待操作玩家：act=操作方；respond=响应方 */
  turn: Seat;
  flowers: [Suit | null, Suit | null];
  hands: [Tile[], Tile[]];
  melds: [Meld[], Meld[]];
  rivers: [Tile[], Tile[]];
  wall: Tile[];
  /** act 阶段当前玩家刚摸到的牌（庄家开局首操作为 null） */
  drawnTile: Tile | null;
  /** act 阶段是否允许自摸胡/杠：摸牌（含杠后补牌）或开局为 true，碰牌后为 false */
  claimable: boolean;
  pending: PendingClaim | null;
  /** 过张记录（规则十二）：放弃点炮胡的牌，自己下次摸牌后清空 */
  passTiles: [TileCode[], TileCode[]];
  ready: [boolean, boolean];
  result: RoundResult | null;
  tally: Tally;
  seq: number;
}

export type Action =
  | { type: 'choose_flower'; suit: Suit }
  | { type: 'discard'; tileId: number }
  | { type: 'peng' }
  | { type: 'gang'; tileId?: number; kind?: GangKind }
  | { type: 'hu' }
  | { type: 'pass' }
  | { type: 'ready'; seat: Seat };

export type GameEvent =
  | { type: 'round_started'; round: number; banker: Seat }
  | { type: 'flower_chosen'; seat: Seat; suit: Suit }
  | { type: 'exchanged'; bankerSuit: Suit; bankerWild: number; otherWild: number }
  | { type: 'drawn'; seat: Seat }
  | { type: 'discarded'; seat: Seat; tile: Tile }
  | { type: 'peng'; seat: Seat; tile: Tile }
  | { type: 'gang'; seat: Seat; kind: GangKind; tile: Tile }
  | { type: 'replacement_drawn'; seat: Seat }
  | { type: 'hu'; seat: Seat; kind: 'zimo' | 'dianpao'; tile: Tile }
  | { type: 'draw_game'; reason: 'wall_empty' | 'gang_no_replacement' }
  | { type: 'round_settled'; result: RoundResult }
  | { type: 'next_round'; round: number; banker: Seat };

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
}
