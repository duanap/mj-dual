import type { Action, Tile } from '../src/index';

/** The engine deduplicates equal faces; UI may display every physical copy. */
export function discardTargets(hand: readonly Tile[], actions: readonly Action[]): Map<number, number> {
  const byFace = new Map<string, number>();
  for (const action of actions) {
    if (action.type !== 'discard') continue;
    const tile = hand.find((t) => t.id === action.tileId && t.id >= 0);
    if (tile) byFace.set(`${tile.suit}:${tile.rank}`, action.tileId);
  }
  const targets = new Map<number, number>();
  for (const tile of hand) {
    const target = byFace.get(`${tile.suit}:${tile.rank}`);
    if (tile.id >= 0 && target !== undefined) targets.set(tile.id, target);
  }
  return targets;
}

/** Client-side selection only; legal discards still come from the engine/server. */
export class DiscardSelection {
  id: number | null = null;
  locked = false;
  private context = '';

  sync(context: string, legalIds: readonly number[]): void {
    if (context !== this.context) {
      this.reset();
      this.context = context;
    }
    if (this.id !== null && !legalIds.includes(this.id)) this.id = null;
  }
  choose(context: string, tileId: number, legalIds: readonly number[]): number | null {
    this.sync(context, legalIds);
    if (this.locked || !legalIds.includes(tileId)) return null;
    if (this.id === tileId) { this.id = null; return tileId; }
    this.id = tileId;
    return null;
  }
  lock(): void { this.id = null; this.locked = true; }
  clear(): void { this.id = null; }
  reset(): void { this.id = null; this.locked = false; }
}
