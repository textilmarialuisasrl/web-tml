export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Memory-only Sync Circuit Breaker.
 * Prevents sync storms and network spam when backend is unreachable or failing consistently.
 * If 3 consecutive network failures occur, the circuit opens for 30s.
 */
class SyncCircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private lastStateChangeTime = Date.now();
  
  private readonly FAILURE_THRESHOLD = 3;
  private readonly OPEN_COOLDOWN_MS = 30_000;

  public getState(): CircuitState {
    this.checkCooldown();
    return this.state;
  }

  public isOpen(): boolean {
    return this.getState() === "OPEN";
  }

  public recordSuccess(): void {
    this.checkCooldown();
    if (this.state === "HALF_OPEN" || this.state === "OPEN") {
      this.state = "CLOSED";
      this.lastStateChangeTime = Date.now();
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}][SYNC][INFO] circuit-recovered - Sync circuit breaker recovered back to CLOSED.`);
    }
    this.failureCount = 0;
  }

  public recordFailure(): void {
    this.checkCooldown();
    this.failureCount++;

    if (this.state === "CLOSED" && this.failureCount >= this.FAILURE_THRESHOLD) {
      this.state = "OPEN";
      this.lastStateChangeTime = Date.now();
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}][SYNC][CRITICAL] circuit-open - Sync circuit breaker opened due to ${this.failureCount} consecutive network failures.`);
    } else if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.lastStateChangeTime = Date.now();
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}][SYNC][CRITICAL] circuit-open - Sync circuit breaker returned to OPEN after failure in HALF_OPEN state.`);
    }
  }

  private checkCooldown(): void {
    if (this.state === "OPEN" && Date.now() - this.lastStateChangeTime > this.OPEN_COOLDOWN_MS) {
      this.state = "HALF_OPEN";
      this.lastStateChangeTime = Date.now();
      const timestamp = new Date().toISOString();
      console.warn(`[${timestamp}][SYNC][WARN] circuit-half-open - Sync circuit breaker transitioned to HALF_OPEN after cooldown interval.`);
    }
  }
}

export const syncCircuitBreaker = new SyncCircuitBreaker();
export default syncCircuitBreaker;
