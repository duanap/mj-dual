import type { Meld } from './types';
import type { Suit, Tile } from './tile';

/** 胡牌资格（规则十）：杠数量 >= 2 */
export function gangCount(melds: readonly Meld[]): number {
  return melds.filter((m) => m.type === 'gang').length;
}

/**
 * 胡牌判定（规则十统一公式）：
 *   总结构恒为 4组 + 1对；杠/碰各算已完成的一组；
 *   手牌（含胡牌张）= (4 - 杠 - 碰) 组 + 1 对，恰好分解。
 * 规则五：碰/杠/胡只能用本家花色 —— 手牌含异花废牌则不可能胡（定花清一色）。
 */
export function canWin(hand: readonly Tile[], melds: readonly Meld[], flower: Suit): boolean {
  if (gangCount(melds) < 2) return false;
  const need = 4 - melds.length;
  if (need < 0) return false;
  if (hand.some((t) => t.suit !== flower)) return false;
  return decomposeWithPair(rankCounts(hand), need);
}

function rankCounts(tiles: readonly Tile[]): number[] {
  const c = new Array<number>(10).fill(0);
  for (const t of tiles) c[t.rank]++;
  return c;
}

/** 选一对后，剩余牌必须恰好分解为 groups 个顺子/刻子 */
function decomposeWithPair(c: number[], groups: number): boolean {
  for (let r = 1; r <= 9; r++) {
    if (c[r] >= 2) {
      c[r] -= 2;
      const ok = decompose(c, groups);
      c[r] += 2;
      if (ok) return true;
    }
  }
  return false;
}

/** 把计数数组恰好分解为 groups 个组（顺子 n,n+1,n+2 或刻子 n,n,n） */
function decompose(c: number[], groups: number): boolean {
  if (groups === 0) return c.every((v) => v === 0);
  let first = 1;
  while (first <= 9 && c[first] === 0) first++;
  if (first > 9) return false;
  if (c[first] >= 3) {
    c[first] -= 3;
    const ok = decompose(c, groups - 1);
    c[first] += 3;
    if (ok) return true;
  }
  if (first <= 7 && c[first + 1] > 0 && c[first + 2] > 0) {
    c[first]--;
    c[first + 1]--;
    c[first + 2]--;
    const ok = decompose(c, groups - 1);
    c[first]++;
    c[first + 1]++;
    c[first + 2]++;
    if (ok) return true;
  }
  return false;
}
