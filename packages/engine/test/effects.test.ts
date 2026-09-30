import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/index';
import { celebrationForEvent } from '../demo/effects';

describe('牌局视觉提示', () => {
  it('暗杠提示只显示类别，不包含对手的牌面', () => {
    const event: GameEvent = { type: 'gang', seat: 1, kind: 'an', tile: { id: 35, suit: 'tiao', rank: 8 } };
    const effect = celebrationForEvent(event, 0);
    expect(effect).toEqual({ type: 'gang', message: '对手暗杠' });
    expect(JSON.stringify(effect)).not.toContain('35');
    expect(JSON.stringify(effect)).not.toContain('tiao');
  });

  it('明杠、补杠、自摸胡、点炮胡和流局使用简短标签', () => {
    expect(celebrationForEvent({ type: 'gang', seat: 0, kind: 'ming', tile: { id: 1, suit: 'tong', rank: 1 } }, 0))
      .toEqual({ type: 'gang', message: '你明杠' });
    expect(celebrationForEvent({ type: 'gang', seat: 1, kind: 'bu', tile: { id: 2, suit: 'tong', rank: 2 } }, 0))
      .toEqual({ type: 'gang', message: '对手补杠' });
    expect(celebrationForEvent({ type: 'hu', seat: 0, kind: 'zimo', tile: { id: 3, suit: 'tong', rank: 3 } }, 0))
      .toEqual({ type: 'hu', message: '你自摸胡！' });
    expect(celebrationForEvent({ type: 'hu', seat: 1, kind: 'dianpao', tile: { id: 4, suit: 'tiao', rank: 4 } }, 0))
      .toEqual({ type: 'hu', message: '对手点炮胡！' });
    expect(celebrationForEvent({ type: 'draw_game', reason: 'wall_empty' }, 0))
      .toEqual({ type: 'draw', message: '流局' });
  });

  it('忽略非庆祝类和已结算事件，避免重复播放', () => {
    const roundEvent: GameEvent = { type: 'round_settled', result: { winner: null, kind: 'draw', reason: 'wall_empty' } };
    expect(celebrationForEvent({ type: 'discarded', seat: 0, tile: { id: 1, suit: 'tong', rank: 1 } }, 0)).toBeNull();
    expect(celebrationForEvent(roundEvent, 0)).toBeNull();
  });
});
