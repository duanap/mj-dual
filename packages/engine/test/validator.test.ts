import { describe, expect, it } from 'vitest';
import { checkState } from '../src/validator';
import { createMatchForTest } from '../src/engine';
import { hand } from './helpers';

function base() {
  return createMatchForTest({
    hands: [
      hand('T1 T2 T3 T4 T5 T6 T7 T8 T9 T9 T8 T8 T7 T7'),
      hand('B1 B2 B3 B4 B5 B6 B7 B8 B9 B9 B8 B8 B7'),
    ],
    flower: 'tong',
  });
}

describe('状态校验（架构文档八）', () => {
  it('正常状态无问题', () => {
    expect(checkState(base())).toEqual([]);
  });

  it('丢牌被检出（72 张守恒）', () => {
    const s = base();
    s.wall.pop();
    expect(checkState(s).some((i) => i.includes('总张数'))).toBe(true);
  });

  it('重复牌被检出', () => {
    const s = base();
    s.hands[0].push(s.hands[1][0]!);
    expect(checkState(s).some((i) => i.includes('重复'))).toBe(true);
  });

  it('手牌等价数被检出', () => {
    const s = base();
    const moved = s.hands[0].pop()!;
    s.melds[0].push({ type: 'peng', code: 'T7', tiles: [moved, moved, moved], concealed: false, upgraded: false });
    const issues = checkState(s);
    expect(issues.some((i) => i.includes('等价'))).toBe(true);
  });
});
