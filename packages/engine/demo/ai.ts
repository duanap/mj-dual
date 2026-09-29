// 对手 AI：贪心策略——能胡就胡、能杠就杠、能碰就碰；
// 出牌选对手牌价值（花色内的对子/搭子连接）损伤最小的张，异花废牌自然先出。
import type { Action, GameState, RNG, Seat, Suit, Tile } from '../src/index';
import { availableActions } from '../src/index';

function suitCount(hand: Tile[], s: Suit): number {
  return hand.filter((t) => t.suit === s).length;
}

function handValue(hand: Tile[], flower: Suit): number {
  const cnt = new Map<number, number>();
  for (const t of hand) {
    if (t.suit === flower) cnt.set(t.rank, (cnt.get(t.rank) ?? 0) + 1);
  }
  let v = 0;
  for (const [r, c] of cnt) {
    if (c >= 2) v += 2 + c; // 对子/刻子潜力
    if (cnt.has(r - 1)) v += 2; // 相邻搭子
    if (cnt.has(r + 1)) v += 2;
    if (cnt.has(r - 2)) v += 1; // 隔张搭子
    if (cnt.has(r + 2)) v += 1;
  }
  return v;
}

export function aiChooseAction(state: GameState, seat: Seat, rng: RNG): Action {
  const acts = availableActions(state, seat);
  const hu = acts.find((a) => a.type === 'hu');
  if (hu) return hu;
  const gang = acts.find((a) => a.type === 'gang');
  if (gang) return gang;
  const peng = acts.find((a) => a.type === 'peng');
  if (peng) return peng;

  const flowerChoices = acts.filter((a): a is { type: 'choose_flower'; suit: Suit } => a.type === 'choose_flower');
  if (flowerChoices.length > 0) {
    const hand = state.hands[seat];
    return { type: 'choose_flower', suit: suitCount(hand, 'tong') >= suitCount(hand, 'tiao') ? 'tong' : 'tiao' };
  }

  const discards = acts.filter((a): a is { type: 'discard'; tileId: number } => a.type === 'discard');
  const flower = state.flowers[seat]!;
  let best: { type: 'discard'; tileId: number }[] = [];
  let bestV = Infinity;
  for (const d of discards) {
    const rest = state.hands[seat].filter((t) => t.id !== d.tileId);
    const v = handValue(rest, flower);
    if (v < bestV) {
      bestV = v;
      best = [d];
    } else if (v === bestV) {
      best.push(d);
    }
  }
  if (best.length === 0) throw new Error('AI 无可出牌');
  return best[rng.int(best.length)]!;
}
