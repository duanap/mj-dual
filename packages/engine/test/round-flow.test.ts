import { describe, expect, it } from 'vitest';
import { createMatchForTest, mulberry32, type GameState, type Seat } from '../src/index';
import { handsTuple } from './helpers';
import { advanceLocalRound } from '../demo/round-flow';

function finishedState(winner: Seat | null, banker: Seat): GameState {
  const state = createMatchForTest({
    hands: handsTuple('T1 T2 T3 T4 T5 T6 T7 T8 T9 T1 T2 T3 T4 B5', 'B1 B2 B3 B4 B5 B6 B7 B8 B9 B1 B2 B3 T5'),
    flower: 'tong',
  });
  state.banker = banker;
  state.phase = 'settlement';
  state.result = { winner, kind: winner == null ? 'draw' : 'zimo' };
  state.tally = { wins: [2, 4], draws: 3 };
  state.ready = [false, false];
  return state;
}

describe('人机模式的再来一局', () => {
  it('一次点击直接推进一局并由胡牌者坐庄', () => {
    const before = finishedState(1, 0);
    const next = advanceLocalRound(before, mulberry32(9));
    expect(next.state.round).toBe(2);
    expect(next.state.phase).toBe('choose_flower');
    expect(next.state.banker).toBe(1);
    expect(next.state.tally).toEqual({ wins: [2, 4], draws: 3 });
    expect(next.state.ready).toEqual([false, false]);
    expect(next.events.map((event) => event.type)).toContain('round_started');
    expect(before.phase).toBe('settlement');
    expect(before.round).toBe(1);
  });

  it('流局后庄家连庄并保留累计战绩', () => {
    const next = advanceLocalRound(finishedState(null, 0), mulberry32(12));
    expect(next.state.round).toBe(2);
    expect(next.state.banker).toBe(0);
    expect(next.state.tally).toEqual({ wins: [2, 4], draws: 3 });
  });
});
