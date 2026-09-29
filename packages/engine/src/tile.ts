// 牌定义：筒/条两门各 1-9 各 4 张，共 72 张（规则一）
export type Suit = 'tong' | 'tiao';

export const SUITS: readonly Suit[] = ['tong', 'tiao'];
export const SUIT_LABEL: Record<Suit, string> = { tong: '筒', tiao: '条' };

/** 牌面代码，如 "T5"=5筒、"B9"=9条 */
export type TileCode = string;

export interface Tile {
  /** 全局唯一 id：suitIndex*36 + (rank-1)*4 + copyIndex */
  id: number;
  suit: Suit;
  /** 1..9 */
  rank: number;
}

export const RANKS_PER_SUIT = 9;
export const COPIES_PER_TILE = 4;
export const TILES_PER_SUIT = RANKS_PER_SUIT * COPIES_PER_TILE; // 36
export const TOTAL_TILES = TILES_PER_SUIT * 2; // 72

function suitIndex(s: Suit): number {
  return s === 'tong' ? 0 : 1;
}

export function codeOf(t: Tile): TileCode {
  return (t.suit === 'tong' ? 'T' : 'B') + t.rank;
}

export function labelOf(t: Tile): string {
  return `${t.rank}${SUIT_LABEL[t.suit]}`;
}

export function tileById(id: number): Tile {
  if (id < 0 || id >= TOTAL_TILES) throw new Error(`非法牌 id: ${id}`);
  const suit: Suit = id < TILES_PER_SUIT ? 'tong' : 'tiao';
  const rank = (Math.floor(id / COPIES_PER_TILE) % RANKS_PER_SUIT) + 1;
  return { id, suit, rank };
}

export function createDeck(): Tile[] {
  const deck: Tile[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= RANKS_PER_SUIT; rank++) {
      for (let copy = 0; copy < COPIES_PER_TILE; copy++) {
        deck.push({ id: suitIndex(suit) * TILES_PER_SUIT + (rank - 1) * COPIES_PER_TILE + copy, suit, rank });
      }
    }
  }
  return deck;
}

export function otherSuit(s: Suit): Suit {
  return s === 'tong' ? 'tiao' : 'tong';
}

export function countCode(tiles: readonly Tile[], code: TileCode): number {
  let n = 0;
  for (const t of tiles) if (codeOf(t) === code) n++;
  return n;
}
