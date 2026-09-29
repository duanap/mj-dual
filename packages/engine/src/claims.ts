import type { GameState, Seat } from './types';
import { canWin, gangCount } from './hu';
import { codeOf, countCode, type Tile, type TileCode } from './tile';

/** 对一张弃牌的全部响应选项（规则五/七/十：限本家花色） */
export interface ClaimOptions {
  hu: boolean;
  peng: boolean;
  gang: boolean;
}

export function claimsOn(state: GameState, seat: Seat, tile: Tile): ClaimOptions {
  const flower = state.flowers[seat];
  if (!flower || tile.suit !== flower) return { hu: false, peng: false, gang: false };
  const hand = state.hands[seat];
  const melds = state.melds[seat];
  const passed = state.passTiles[seat].includes(codeOf(tile));
  const n = countCode(hand, codeOf(tile));
  return {
    // 规则十二：过张后同一张牌不能点炮胡，直到自己下次摸牌
    hu: !passed && canWin([...hand, tile], melds, flower),
    peng: n >= 2,
    gang: n >= 3 && gangCount(melds) < 4,
  };
}

export function hasAnyClaim(c: ClaimOptions): boolean {
  return c.hu || c.peng || c.gang;
}

/** 手牌中某代码的任一张的 id（找不到返回 undefined） */
export function findTileId(hand: readonly Tile[], code: TileCode): number | undefined {
  return hand.find((t) => codeOf(t) === code)?.id;
}
