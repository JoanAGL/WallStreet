// ── Circuit Breaker ───────────────────────────────────────────────────────────
// Protects against cascading failures when external APIs (Gemini, NewsAPI,
// Yahoo Finance) become unavailable or rate-limit the service.
//
// State machine:
//   CLOSED   → normal operation; tracks consecutive failures
//   OPEN     → fast-fail mode; all calls return fallback until cooldown expires
//   HALF_OPEN → one trial call allowed; success resets to CLOSED, failure reopens

type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker {
  private failures = 0;
  private lastFailureAt = 0;
  private state: BreakerState = "CLOSED";

  /**
   * @param name       Identifier for logging (e.g. "gemini", "newsapi")
   * @param threshold  Consecutive failures before opening (default 3)
   * @param timeoutMs  Cooldown period in ms before attempting recovery (default 60s)
   */
  constructor(
    private readonly name: string,
    private readonly threshold = 3,
    private readonly timeoutMs = 60_000
  ) {}

  /**
   * Executes `action`. If the breaker is OPEN and the cooldown has not elapsed,
   * returns `fallback()` immediately without calling `action`.
   * On success, resets failure counter. On failure, increments counter and opens
   * the breaker once the threshold is reached.
   */
  async fire<T>(
    action: () => Promise<T>,
    fallback: () => T | Promise<T>
  ): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureAt >= this.timeoutMs) {
        this.state = "HALF_OPEN";
      } else {
        console.warn(`[CircuitBreaker:${this.name}] OPEN — returning fallback`);
        return fallback();
      }
    }

    try {
      const result = await action();
      if (this.state === "HALF_OPEN") {
        this.state = "CLOSED";
        this.failures = 0;
        console.info(`[CircuitBreaker:${this.name}] Recovered → CLOSED`);
      } else {
        this.failures = 0;
      }
      return result;
    } catch (err) {
      this.failures++;
      this.lastFailureAt = Date.now();
      if (this.failures >= this.threshold) {
        this.state = "OPEN";
        console.error(
          `[CircuitBreaker:${this.name}] ${this.failures} failures → OPEN. ` +
          `Cooldown ${this.timeoutMs / 1000}s`
        );
      }
      // Always return fallback on error — caller never sees an unhandled throw
      return fallback();
    }
  }

  get isOpen(): boolean { return this.state === "OPEN"; }
  get status(): BreakerState { return this.state; }

  /** Reset to CLOSED (useful for tests or manual operator intervention). */
  reset(): void {
    this.state = "CLOSED";
    this.failures = 0;
    this.lastFailureAt = 0;
  }
}

// ── Per-service singletons ────────────────────────────────────────────────────
// Module-level instances so state persists across calls within a serverless
// function lifetime. Between cold starts they reset naturally.

export const geminiBreaker   = new CircuitBreaker("gemini",  3, 60_000);
export const newsApiBreaker  = new CircuitBreaker("newsapi", 3, 120_000);
export const yahooBreaker    = new CircuitBreaker("yahoo",   3, 60_000);
export const finnhubBreaker  = new CircuitBreaker("finnhub", 3, 60_000);
