import type { GameEvent, GameState, RoundResult, Seat } from './types';
import type { RNG } from './rng';
import { deal } from './deal';

/** 本局终局：记录结果、更新累计比分（V1 不算倍数，规则十五） */
export function settle(state: GameState, result: RoundResult, events: GameEvent[]): void {
  state.result = result;
  state.phase = 'settlement';
  state.ready = [false, false];
  state.pending = null;
  state.drawnTile = null;
  state.claimable = false;
  if (result.winner != null) state.tally.wins[result.winner]++;
  else state.tally.draws++;
  events.push({ type: 'round_settled', result });
}

/** 规则二：胡牌者下局坐庄；流局庄家连庄 */
export function nextBanker(state: GameState): Seat {
  return state.result?.winner ?? state.banker;
}

/** 进入下一局：重新洗牌发牌、重新定花（规则三/四） */
export function startNextRound(state: GameState, rng: RNG, events: GameEvent[]): void {
  if (state.result == null) throw new Error('本局尚未结算，不能开下一局');
  state.banker = nextBanker(state);
  state.round++;
  const { hands, wall } = deal(rng, state.banker);
  state.hands = hands;
  state.wall = wall;
  state.melds = [[], []];
  state.rivers = [[], []];
  state.flowers = [null, null];
  state.drawnTile = null;
  state.claimable = false;
  state.pending = null;
  state.passTiles = [[], []];
  state.ready = [false, false];
  state.result = null;
  state.phase = 'choose_flower';
  state.turn = state.banker;
  events.push({ type: 'next_round', round: state.round, banker: state.banker });
  events.push({ type: 'round_started', round: state.round, banker: state.banker });
}
