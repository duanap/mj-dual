import type { Action, PlayerView, Seat } from '@mj/engine';

export type RoomPhase = 'waiting' | 'playing' | 'finished';
export type RoomGameView = Omit<PlayerView, 'ready' | 'yourActions'> & {
  yourActions: Exclude<Action, { type: 'ready' }>[];
};

export interface RoomMemberSnapshot {
  connected: boolean;
}

/** Per-seat room information. Tokens, wall contents, and opponent hidden tiles are never included. */
export interface RoomSnapshot {
  code: string;
  you: Seat;
  host: 0;
  phase: RoomPhase;
  members: [RoomMemberSnapshot, RoomMemberSnapshot];
  round: number;
  tally: { wins: [number, number]; draws: number };
  view: RoomGameView | null;
  canStart: boolean;
  canRematch: boolean;
}

export type RoomControlResult =
  | { ok: true }
  | { ok: false; code: string; message: string };
