// 托管/建议（架构文档九 超时托管）：服务端超时代打与本地 AI 共用同一策略。
// 策略：能胡就胡 > 能杠就杠 > 能碰就碰；定花选手牌较多花色；出牌选手牌价值损伤最小的张。
import type { Action, GameState, Seat } from './types';
import type { RNG } from './rng';
import type { Suit, Tile } from './tile';
import { availableActions } from './engine';
import { suggestFlower } from './changeFlower';

function handValue(hand: readonly Tile[], flower: Suit): number {
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

export function suggestAction(state: GameState, seat: Seat, rng: RNG): Action {
  const acts = availableActions(state, seat);
  if (acts.some((a) => a.type === 'hu')) return { type: 'hu' };
  const gang = acts.find((a) => a.type === 'gang');
  if (gang) return gang;
  const peng = acts.find((a) => a.type === 'peng');
  if (peng) return peng;
  if (state.phase === 'choose_flower') {
    return { type: 'choose_flower', suit: suggestFlower(state.hands[seat]) };
  }
  const discards = acts.filter((a): a is { type: 'discard'; tileId: number } => a.type === 'discard');
  if (discards.length === 0) throw new Error(`座位 ${seat} 无可建议操作`);
  const flower = state.flowers[seat];
  let best: { type: 'discard'; tileId: number }[] = [];
  let bestV = Infinity;
  for (const d of discards) {
    const rest = state.hands[seat].filter((t) => t.id !== d.tileId);
    const v = flower ? handValue(rest, flower) : 0;
    if (v < bestV) {
      bestV = v;
      best = [d];
    } else if (v === bestV) {
      best.push(d);
    }
  }
  return best[rng.int(best.length)]!;
}
