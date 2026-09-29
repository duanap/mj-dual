import { describe, expect, it } from 'vitest';
import { createMatchForTest, toPlayerView } from '../src/index';
import { handsTuple } from './helpers';

describe('PlayerView 按玩家视角过滤', () => {
  it('对家暗杠牌面匿名化（结算才亮）；自家与公开牌完整', () => {
    const s = createMatchForTest({
      hands: handsTuple('T1 T2 T3 T4 T5 T6 T7 T8 T9 T1 T2 T3 T4 B5', 'B1 B2 B3 B4 B5 B6 B7 B8 B9 B1 B2 B3 T5'),
      flower: 'tong',
    });
    // 手工构造：座位1 有一组暗杠 + 一组明碰
    s.melds[1] = [
      { type: 'gang', code: 'B1', tiles: s.hands[1].splice(0, 4).map((t) => ({ ...t })), concealed: true, upgraded: false },
      { type: 'peng', code: 'B5', tiles: s.hands[1].splice(0, 3), concealed: false, upgraded: false },
    ];
    s.melds[0] = [
      { type: 'gang', code: 'T1', tiles: [{ id: 0, suit: 'tong', rank: 1 }, { id: 1, suit: 'tong', rank: 1 }, { id: 2, suit: 'tong', rank: 1 }, { id: 3, suit: 'tong', rank: 1 }], concealed: true, upgraded: false },
    ];

    const v0 = toPlayerView(s, 0);
    // 自家暗杠：完整牌面
    expect(v0.melds[0][0].tiles.every((t) => t.id >= 0)).toBe(true);
    // 对家暗杠：匿名占位（id<0），数量不变
    const oppAn = v0.melds[1][0];
    expect(oppAn.concealed).toBe(true);
    expect(oppAn.tiles.length).toBe(4);
    expect(oppAn.tiles.every((t) => t.id < 0)).toBe(true);
    // 对家明碰：完整牌面
    expect(v0.melds[1][1].tiles.every((t) => t.id >= 0)).toBe(true);
    // 对家视角看座位0的暗杠：同样匿名
    const v1 = toPlayerView(s, 1);
    expect(v1.melds[0][0].tiles.every((t) => t.id < 0)).toBe(true);
    expect(v1.melds[1][0].tiles.every((t) => t.id >= 0)).toBe(true);

    // 结算阶段：全部亮牌
    s.phase = 'settlement';
    const vs0 = toPlayerView(s, 0);
    expect(vs0.melds[1][0].tiles.every((t) => t.id >= 0)).toBe(true);
  });

  it('只有当前摸牌者携带 drawnTile；牌墙只发数量', () => {
    const s = createMatchForTest({
      hands: handsTuple('T1 T2 T3 T4 T5 T6 T7 T8 T9 T1 T2 T3 T4 B5', 'B1 B2 B3 B4 B5 B6 B7 B8 B9 B1 B2 B3 T5'),
      flower: 'tong',
    });
    s.phase = 'act';
    s.turn = 1;
    s.drawnTile = { id: 40, suit: 'tiao', rank: 5 };
    const v0 = toPlayerView(s, 0);
    const v1 = toPlayerView(s, 1);
    expect(v0.drawnTile).toBeNull();
    expect(v1.drawnTile?.id).toBe(40);
    expect(v0).toHaveProperty('wallCount');
    expect(v0).not.toHaveProperty('wall');
  });
});
