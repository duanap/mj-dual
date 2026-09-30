import { applyAction } from '../src/index';
import type { ActionResult, GameState, RNG } from '../src/index';

/** Advance both local seats together after the player chooses to replay. */
export function advanceLocalRound(state: GameState, rng: RNG): ActionResult {
  if (state.phase !== 'settlement' || state.result == null) {
    throw new Error('只有本局结束后才能再来一局');
  }

  let next = state;
  const events: ActionResult['events'] = [];
  for (const seat of [0, 1] as const) {
    if (next.ready[seat]) continue;
    const result = applyAction(next, { type: 'ready', seat }, rng);
    next = result.state;
    events.push(...result.events);
  }
  return { state: next, events };
}
