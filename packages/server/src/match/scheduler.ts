/**
 * Scheduler abstraction — dependency inversion for time. The coordinator
 * never touches wall-clock APIs directly, so all timing logic is unit-
 * testable with a manual scheduler and the engine stays deterministic.
 */

export interface ScheduledTask {
  cancel(): void;
}

export interface Scheduler {
  schedule(delayMs: number, callback: () => void): ScheduledTask;
}

/** Production scheduler backed by standard timers. */
export class TimeoutScheduler implements Scheduler {
  schedule(delayMs: number, callback: () => void): ScheduledTask {
    const handle = setTimeout(callback, delayMs);
    return {
      cancel: (): void => {
        clearTimeout(handle);
      },
    };
  }
}
