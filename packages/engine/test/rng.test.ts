import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/rng';
import { cryptoRng } from '../src/rng.node';
import { newMatch } from '../src/engine';
import { assertState } from '../src/validator';

describe('随机源（审查处置：种子生成器仅限测试/模拟）', () => {
  it('mulberry32 同种子序列可复现，异种子序列不同', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const seqA = Array.from({ length: 10 }, () => a.int(100));
    expect(seqA).toEqual(Array.from({ length: 10 }, () => b.int(100)));
    expect(seqA).not.toEqual(Array.from({ length: 10 }, () => c.int(100)));
  });

  it('mulberry32 输出在 [0, n) 界内，n<=0 报错', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const v = rng.int(9);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(9);
    }
    expect(() => rng.int(0)).toThrow();
    expect(() => rng.int(-1)).toThrow();
  });

  it('cryptoRng 输出在界内且非退化', () => {
    for (let i = 0; i < 200; i++) {
      const v = cryptoRng.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
    expect(() => cryptoRng.int(0)).toThrow();
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) seen.add(cryptoRng.int(2));
    expect([...seen].sort()).toEqual([0, 1]);
  });

  it('newMatch 接受注入 RNG：同源可复现，cryptoRng 开局通过守恒校验', () => {
    const a = newMatch(mulberry32(7));
    const b = newMatch(mulberry32(7));
    expect(a.banker).toBe(b.banker);
    expect(a.hands.map((h) => h.map((t) => t.id))).toEqual(b.hands.map((h) => h.map((t) => t.id)));
    expect(() => assertState(newMatch(cryptoRng))).not.toThrow();
  });
});
