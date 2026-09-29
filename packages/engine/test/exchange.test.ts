import { describe, expect, it } from 'vitest';
import { suggestFlower, exchangeFlower } from '../src/changeFlower';
import { deal } from '../src/deal';
import { mulberry32 } from '../src/rng';
import { hand } from './helpers';
import type { Suit, Tile } from '../src/tile';

const tongCount = (tiles: Tile[]) => tiles.filter((t) => t.suit === 'tong').length;

describe('定花交换（规则四）', () => {
  it('情况A：两门总数恰好 14，直接交换', () => {
    const hands: [Tile[], Tile[]] = [
      hand('T1 T2 T3 T4 T5 T6 T7 T8 T9 T9 B1 B2 B3 B4'), // 10筒 + 4条
      hand('T3 T5 T7 T9 B1 B2 B3 B4 B5 B6 B7 B8 B9'), // 4筒 + 9条
    ];
    const summary = exchangeFlower(hands, 0, 'tong');
    expect(hands[0].length).toBe(14);
    expect(hands[1].length).toBe(13);
    expect(tongCount(hands[0])).toBe(14);
    expect(tongCount(hands[1])).toBe(0);
    expect(summary.bankerWild).toBe(0);
    expect(summary.otherWild).toBe(0);
  });

  it('情况B：总数不足 14，闲家用异花垫足，庄家拿废牌', () => {
    const hands: [Tile[], Tile[]] = [
      hand('T1 T2 T3 T4 T5 T6 T7 T8 T9 T9 B1 B2 B3 B4'), // 10筒
      hand('T3 T5 T7 B1 B2 B3 B4 B5 B6 B7 B8 B9 B9'), // 3筒
    ];
    const summary = exchangeFlower(hands, 0, 'tong');
    expect(hands[0].length).toBe(14);
    expect(hands[1].length).toBe(13);
    expect(tongCount(hands[0])).toBe(13); // 13筒 + 1条废牌
    expect(summary.bankerWild).toBe(1);
    expect(summary.otherWild).toBe(0);
  });

  it('情况C：总数超过 14，多余的筒留在闲家成为废牌', () => {
    const hands: [Tile[], Tile[]] = [
      hand('T1 T2 T3 T4 T5 T6 T7 T8 T9 T9 B1 B2 B3 B4'), // 10筒
      hand('T1 T2 T3 T4 T5 T6 B1 B2 B3 B4 B5 B6 B7'), // 6筒
    ];
    const summary = exchangeFlower(hands, 0, 'tong');
    expect(hands[0].length).toBe(14);
    expect(hands[1].length).toBe(13);
    expect(tongCount(hands[0])).toBe(14);
    expect(tongCount(hands[1])).toBe(2); // 16 - 14 = 2 张筒成为闲家废牌
    expect(summary.bankerWild).toBe(0);
    expect(summary.otherWild).toBe(2);
  });

  it('校验：交换后恒为庄14/闲13', () => {
    const hands: [Tile[], Tile[]] = [
      hand('T1 T1 T1 T1 B1 B1 B1 B1 B2 B2 B2 B2 B3 B3'),
      hand('T2 T2 T2 T2 B3 B3 B4 B4 B5 B5 B6 B6 B7'),
    ];
    exchangeFlower(hands, 0, 'tiao');
    expect(hands[0].length).toBe(14);
    expect(hands[1].length).toBe(13);
  });
});

describe('定花托管建议', () => {
  it('选手牌较多的花色，平票取筒', () => {
    expect(suggestFlower(hand('T1 T2 T3 B1 B2'))).toBe('tong');
    expect(suggestFlower(hand('T1 B1 B2 B3'))).toBe('tiao');
    expect(suggestFlower(hand('T1 T2 T3 T4 T5 T6 T7 B1 B2 B3 B4 B5 B6 B7'))).toBe('tong');
  });
});

describe('发牌（规则三）', () => {
  it('标准发牌：庄14/闲13/牌墙45，id 全局唯一', () => {
    const { hands, wall } = deal(mulberry32(7), 0);
    expect(hands[0].length).toBe(14);
    expect(hands[1].length).toBe(13);
    expect(wall.length).toBe(45);
    const ids = new Set([...hands[0], ...hands[1], ...wall].map((t) => t.id));
    expect(ids.size).toBe(72);
  });

  it('强制手牌：其余进牌墙', () => {
    const bankerHand = hand('T1 T2 T3 T4 T5 T6 T7 T8 T9 T9 T8 T8 T7 T7');
    const otherHand = hand('B1 B2 B3 B4 B5 B6 B7 B8 B9 B9 B8 B8 B7');
    const { hands, wall } = deal(mulberry32(7), 0, { hands: [bankerHand, otherHand] });
    expect(hands[0]).toEqual(bankerHand);
    expect(hands[1]).toEqual(otherHand);
    expect(wall.length).toBe(45);
  });

  it('强制手牌数量或 id 非法时报错', () => {
    const ok = hand('B1 B2 B3 B4 B5 B6 B7 B8 B9 B9 B8 B8 B7');
    expect(() => deal(mulberry32(1), 0, { hands: [hand('T1 T2'), ok] })).toThrow();
    expect(() =>
      deal(mulberry32(1), 0, {
        hands: [hand('T1 T2 T3 T4 T5 T6 T7 T8 T9 T9 T8 T8 T7 T7'), hand('B1 B2 B3 B4 B5 B6 B7 B8 B9 B9 B8 B8 B1' as string)],
      }),
    ).not.toThrow();
  });
});

describe('随机源', () => {
  it('同种子序列一致', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 10 }, () => a.int(100));
    const seqB = Array.from({ length: 10 }, () => b.int(100));
    expect(seqA).toEqual(seqB);
  });
});

describe('花色工具', () => {
  it('otherSuit', async () => {
    const { otherSuit } = await import('../src/tile');
    expect(otherSuit('tong')).toBe('tiao');
    expect(otherSuit('tiao')).toBe('tong');
    const s: Suit = 'tong';
    expect(s).toBe('tong');
  });
});
