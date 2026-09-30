import type { GameEvent, Seat } from '../src/index';

export interface GameEffect {
  type: 'gang' | 'hu' | 'draw';
  message: string;
}

export function celebrationForEvent(event: GameEvent, viewer: Seat): GameEffect | null {
  if (event.type === 'gang') {
    const who = event.seat === viewer ? '你' : '对手';
    const kind = event.kind === 'ming' ? '明杠' : event.kind === 'an' ? '暗杠' : '补杠';
    return { type: 'gang', message: `${who}${kind}` };
  }
  if (event.type === 'hu') {
    const who = event.seat === viewer ? '你' : '对手';
    return { type: 'hu', message: `${who}${event.kind === 'zimo' ? '自摸胡！' : '点炮胡！'}` };
  }
  if (event.type === 'draw_game') return { type: 'draw', message: '流局' };
  return null;
}
