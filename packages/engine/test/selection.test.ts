import { describe, expect, it } from 'vitest';
import { DiscardSelection } from '../demo/selection';

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
