/**
 * Races a promise against a deadline timer.
 *
 * Rejects with `Error("[TIMEOUT:<label>] <ms>ms")` if the timer fires first.
 * The timer is cleared as soon as the race settles so it does not keep the
 * event loop alive after the wrapped promise has already resolved or rejected.
 *
 * @param promise - The operation to time-box.
 * @param ms      - Timeout in milliseconds.
 * @param label   - Human-readable identifier used in the error message,
 *                  e.g. "Finnhub:AAPL" or "Gemini:batch:4".
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new Error(`[TIMEOUT:${label}] ${ms}ms`)),
      ms
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timerId);
  });
}
