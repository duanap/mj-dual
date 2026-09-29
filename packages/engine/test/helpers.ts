import { createDeck, type Suit, type Tile, type TileCode } from '../src/tile';
import type { Meld } from '../src/types';

const idsByCode = new Map<TileCode, number[]>();
for (const t of createDeck()) {
  const code = (t.suit === 'tong' ? 'T' : 'B') + t.rank;
  if (!idsByCode.has(code)) idsByCode.set(code, []);
  idsByCode.get(code)!.push(t.id);
}

export type CopyAlloc = Map<TileCode, number>;

/**
 * 解析 "T1 T2 T3 B5 B5" 形式的牌面串为具体牌。
 * 同一 counters 内同 code 依次取第 0/1/2…张拷贝；多次调用传同一个 Map 可避免 id 撞车。
 */
export function hand(spec: string, counters: CopyAlloc = new Map()): Tile[] {
  return spec
    .trim()
    .split(/\s+/)
    .map((code) => {
      const suit: Suit = code.startsWith('T') ? 'tong' : 'tiao';
      const rank = parseInt(code.slice(1), 10);
      const used = counters.get(code) ?? 0;
      const ids = idsByCode.get(code);
      if (!ids || used >= ids.length) throw new Error(`牌面串超出拷贝数: ${code}`);
      counters.set(code, used + 1);
      return { id: ids[used]!, suit, rank };
    });
}

/** 两家手牌共用拷贝分配（同一 code 合计不得超过 4 张） */
export function handsTuple(bankerSpec: string, otherSpec: string): [Tile[], Tile[]] {
  const counters: CopyAlloc = new Map();
  return [hand(bankerSpec, counters), hand(otherSpec, counters)];
}

export function gangMeld(code: TileCode): Meld {
  return { type: 'gang', code, tiles: hand(`${code} ${code} ${code} ${code}`), concealed: false, upgraded: false };
}

export function pengMeld(code: TileCode): Meld {
  return { type: 'peng', code, tiles: hand(`${code} ${code} ${code}`), concealed: false, upgraded: false };
}

/** 从数组中移除并返回第一个满足条件的元素 */
export function takeOne<T>(arr: T[], pred: (x: T) => boolean): T {
  const idx = arr.findIndex(pred);
  if (idx < 0) throw new Error('takeOne: 未找到元素');
  return arr.splice(idx, 1)[0]!;
}
