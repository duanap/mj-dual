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
