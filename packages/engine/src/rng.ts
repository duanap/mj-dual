// 可注入随机源接口。mulberry32 的全部内部状态只有 32 位、输出序列可被穷举，
// 仅供测试/模拟复现；生产服务端必须使用 rng.node.ts 的 cryptoRng。
export interface RNG {
  /** 均匀分布 [0, n) 的整数 */
  int(n: number): number;
}

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return {
    int(n: number): number {
      if (n <= 0) throw new Error(`RNG.int 需要正整数，收到 ${n}`);
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) % n;
    },
  };
}

/** Fisher-Yates 洗牌，返回新数组 */
export function shuffled<T>(rng: RNG, items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
