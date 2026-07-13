/** Contador en ventana temporal — O(n) prune, sin persistencia. */
export class RollingCounter {
  private timestamps: number[] = [];

  constructor(private readonly windowMs: number) {}

  public record(): void {
    this.timestamps.push(Date.now());
    this.prune();
  }

  public count(): number {
    this.prune();
    return this.timestamps.length;
  }

  public reset(): void {
    this.timestamps = [];
  }

  private prune(): void {
    const cutoff = Date.now() - this.windowMs;
    if (this.timestamps.length < 2) return;
    let i = 0;
    while (i < this.timestamps.length && this.timestamps[i]! < cutoff) i += 1;
    if (i > 0) this.timestamps = this.timestamps.slice(i);
  }
}
