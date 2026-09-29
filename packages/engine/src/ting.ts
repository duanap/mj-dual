import type { Meld } from './types';
import type { Suit, Tile } from './tile';
import { canWin } from './hu';

/**
 * 听牌（规则十）：手牌再进一张本家花色牌即可胡的 rank 列表。
 * 兼作点炮检测与（后续版本的）听牌提示。
 */
export function waitingTiles(hand: readonly Tile[], melds: readonly Meld[], flower: Suit): number[] {
  const waits: number[] = [];
  for (let rank = 1; rank <= 9; rank++) {
    const phantom: Tile = { id: -1, suit: flower, rank };
    if (canWin([...hand, phantom], melds, flower)) waits.push(rank);
  }
  return waits;
}
