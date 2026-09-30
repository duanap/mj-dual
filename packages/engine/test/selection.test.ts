import { describe, expect, it } from 'vitest';
import { DiscardSelection, discardTargets } from '../demo/selection';

describe('同牌副本的出牌映射', () => {
  const hand = [
    { id: 39, suit: 'tiao' as const, rank: 1 },
    { id: 36, suit: 'tiao' as const, rank: 1 },
    { id: 48, suit: 'tiao' as const, rank: 4 },
  ];
  it('排序后的任意同牌副本都对应服务端给出的合法代表', () => {
    const targets = discardTargets(hand, [{ type: 'discard', tileId: 39 }]);
    expect(targets.get(36)).toBe(39);
    expect(targets.get(39)).toBe(39);
    expect(targets.has(48)).toBe(false);
  });
  it('零号一筒也能作为合法出牌代表', () => {
    const targets = discardTargets([
      { id: 1, suit: 'tong', rank: 1 }, { id: 0, suit: 'tong', rank: 1 },
    ], [{ type: 'discard', tileId: 0 }]);
    expect(targets.get(1)).toBe(0);
    expect(targets.get(0)).toBe(0);
  });
  it('不为隐藏占位牌或未获授权的牌面创建出牌目标', () => {
    const targets = discardTargets([...hand, { id: -1, suit: 'tiao', rank: 1 }], [
      { type: 'discard', tileId: 39 }, { type: 'gang', tileId: 48, kind: 'an' },
    ]);
    expect(targets.has(-1)).toBe(false);
    expect(targets.has(48)).toBe(false);
  });
});

describe('手牌二次确认', () => {
  it('第一次点击只选牌，第二次点击同一张才出牌', () => {
    const selection = new DiscardSelection();
    expect(selection.choose('round1:seq1', 12, [12, 13])).toBeNull();
    expect(selection.id).toBe(12);
    expect(selection.choose('round1:seq1', 12, [12, 13])).toBe(12);
    expect(selection.id).toBeNull();
  });

  it('点击另一张牌切换选择，不打出上一张', () => {
    const selection = new DiscardSelection();
    selection.choose('1:1', 12, [12, 13]);
    expect(selection.choose('1:1', 13, [12, 13])).toBeNull();
    expect(selection.id).toBe(13);
  });

  it('新状态到达后，旧选择不能作为出牌确认', () => {
    const selection = new DiscardSelection();
    selection.choose('1:1', 12, [12]);
    expect(selection.choose('1:2', 12, [12])).toBeNull();
    expect(selection.id).toBe(12);
  });

  it('切换对局或模式后清除选择，即使 seq 相同', () => {
    const selection = new DiscardSelection();
    selection.choose('local:1:1', 12, [12]);
    selection.sync('online:1:1', [12]);
    expect(selection.id).toBeNull();
  });

  it('不能确认已经失去出牌资格的牌', () => {
    const selection = new DiscardSelection();
    selection.choose('1:1', 12, [12]);
    expect(selection.choose('1:1', 12, [])).toBeNull();
    expect(selection.id).toBeNull();
  });

  it('等待网络响应时锁定提交，收到新状态后才恢复', () => {
    const selection = new DiscardSelection();
    selection.choose('1:1', 12, [12]);
    selection.choose('1:1', 12, [12]);
    selection.lock();
    expect(selection.choose('1:1', 12, [12])).toBeNull();
    expect(selection.choose('1:1', 12, [12])).toBeNull();
    selection.sync('1:2', [12]);
    expect(selection.choose('1:2', 12, [12])).toBeNull();
    expect(selection.choose('1:2', 12, [12])).toBe(12);
  });

  it('取消选择或打开牌河不能解除尚未确认的网络操作锁', () => {
    const selection = new DiscardSelection();
    selection.choose('1:1', 12, [12]);
    selection.clear();
    expect(selection.id).toBeNull();
    selection.lock();
    selection.clear();
    expect(selection.locked).toBe(true);
    expect(selection.choose('1:1', 12, [12])).toBeNull();
    expect(selection.choose('1:1', 12, [12])).toBeNull();
  });
});
