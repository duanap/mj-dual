import { describe, expect, it } from 'vitest';
import { canWin, gangCount } from '../src/hu';
import { waitingTiles } from '../src/ting';
import { gangMeld, hand, pengMeld } from './helpers';

// 规则十：统一公式 (4 - 杠 - 碰)组 + 1对，资格 = 杠 >= 2
describe('胡牌判定（规则十）', () => {
  const g2 = [gangMeld('T9'), gangMeld('T8')];
  const g3 = [gangMeld('T9'), gangMeld('T8'), gangMeld('T7')];
  const g4 = [gangMeld('T9'), gangMeld('T8'), gangMeld('T7'), gangMeld('T6')];

  it('两杠：7张手牌 + 新牌 = 2组+1对（规则文档示例 123+45+55 等 3/6）', () => {
    const h = hand('T1 T2 T3 T4 T5 T5 T5');
    // 完整听牌集：+1→11+234+555；+3→123+345+55；+4→123+44+555；+6→123+456+55
    expect(waitingTiles(h, g2, 'tong')).toEqual([1, 3, 4, 6]);
    expect(canWin([...h, ...hand('T3')], g2, 'tong')).toBe(true);
    expect(canWin([...h, ...hand('T6')], g2, 'tong')).toBe(true);
    expect(canWin([...h, ...hand('T1')], g2, 'tong')).toBe(true);
    expect(canWin([...h, ...hand('T4')], g2, 'tong')).toBe(true);
    expect(canWin([...h, ...hand('T2')], g2, 'tong')).toBe(false);
    expect(canWin([...h, ...hand('T7')], g2, 'tong')).toBe(false);
    expect(canWin([...h, ...hand('T8')], g2, 'tong')).toBe(false);
  });

  it('两杠另一听型：123+456+5 等 5', () => {
    const h = hand('T1 T2 T3 T4 T5 T6 T5');
    expect(waitingTiles(h, g2, 'tong')).toEqual([5]);
    expect(canWin([...h, ...hand('T5')], g2, 'tong')).toBe(true);
  });

  it('三杠：4张手牌 + 新牌 = 1组+1对（示例 123+5 等 5）', () => {
    const h = hand('T1 T2 T3 T5');
    expect(waitingTiles(h, g3, 'tong')).toEqual([5]);
    expect(canWin([...h, ...hand('T5')], g3, 'tong')).toBe(true);
  });

  it('四杠：单吊', () => {
    const h = hand('T5');
    expect(waitingTiles(h, g4, 'tong')).toEqual([5]);
    expect(canWin([...h, ...hand('T5')], g4, 'tong')).toBe(true);
    expect(canWin([...h, ...hand('T4')], g4, 'tong')).toBe(false);
  });

  it('杠碰混合：2杠1碰 → 1组+1对（手牌 4 张）', () => {
    const melds = [gangMeld('T9'), gangMeld('T8'), pengMeld('T6')];
    const h = hand('T1 T2 T3 T7');
    expect(waitingTiles(h, melds, 'tong')).toEqual([7]);
    expect(canWin([...h, ...hand('T7')], melds, 'tong')).toBe(true);
    expect(canWin([...h, ...hand('T4')], melds, 'tong')).toBe(false);
  });

  it('杠碰混合：2杠2碰 → 单吊', () => {
    const melds = [gangMeld('T9'), gangMeld('T8'), pengMeld('T6'), pengMeld('T4')];
    const h = hand('T5');
    expect(waitingTiles(h, melds, 'tong')).toEqual([5]);
    expect(canWin([...h, ...hand('T5')], melds, 'tong')).toBe(true);
    expect(canWin([...h, ...hand('T4')], melds, 'tong')).toBe(false);
  });

  it('资格：杠数量不足 2 不能胡，牌型再完整也不行', () => {
    // 0 杠，14 张完整 4组+1对
    expect(canWin(hand('T1 T2 T3 T4 T5 T6 T7 T8 T9 T1 T2 T3 T5 T5'), [], 'tong')).toBe(false);
    // 1 杠，11 张完整 3组+1对
    expect(canWin(hand('T1 T2 T3 T4 T5 T6 T7 T8 T9 T5 T5'), [gangMeld('T4')], 'tong')).toBe(false);
    // 碰不算杠数量（规则十三）：2碰+1杠不满足资格
    expect(gangCount([pengMeld('T6'), pengMeld('T4'), gangMeld('T9')])).toBe(1);
    expect(canWin(hand('T1 T2 T3 T7 T7 T5'), [pengMeld('T6'), pengMeld('T4'), gangMeld('T9')], 'tong')).toBe(false);
  });

  it('清一色限制（规则五）：手牌含异花废牌不能胡', () => {
    expect(canWin([...hand('T1 T2 T3 T4 T5 T5 T5'), ...hand('B9')], g2, 'tong')).toBe(false);
    expect(canWin(hand('B1 B2 B3 B4 B5 B5 B5 B6'), g2, 'tong')).toBe(false); // 牌型本身成立，但非本家花色
    expect(canWin(hand('B1 B2 B3 B4 B5 B5 B5 B6'), g2, 'tiao')).toBe(true);
  });

  it('刻子分解：222+777+9 听 8/9（789 或 99）', () => {
    const h = hand('T2 T2 T2 T7 T7 T7 T9');
    expect(waitingTiles(h, g2, 'tong')).toEqual([8, 9]);
    expect(canWin([...h, ...hand('T9')], g2, 'tong')).toBe(true);
    expect(canWin([...h, ...hand('T8')], g2, 'tong')).toBe(true); // 222+789+77
  });

  it('无听牌：不成形的手牌等待列表为空', () => {
    expect(waitingTiles(hand('T1 T1 T3 T5 T7 T9 T9'), g2, 'tong')).toEqual([]);
  });
});
