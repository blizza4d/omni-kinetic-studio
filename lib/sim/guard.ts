/**
 * Async Safety Guard (Phase E2.4)
 *
 * Ensures asynchronous operations (callbacks, worker messages, fetch resolutions,
 * animation frames, timers) started by an episode are safely discarded if they
 * resolve after that episode has been disposed or superseded.
 */

export function ifCurrent<T extends unknown[]>(
  ep: { id: number },
  getCurrentId: () => number | null,
  fn: (...args: T) => void
): (...args: T) => void {
  return (...args: T) => {
    if (getCurrentId() !== ep.id) {
      // Discard late callback from a disposed or previous episode
      return;
    }
    fn(...args);
  };
}

export function createEpisodeAbortController(parentSignal?: AbortSignal): AbortController {
  const ac = new AbortController();
  if (parentSignal) {
    if (parentSignal.aborted) {
      ac.abort(parentSignal.reason);
    } else {
      parentSignal.addEventListener('abort', () => ac.abort(parentSignal.reason), { once: true });
    }
  }
  return ac;
}
