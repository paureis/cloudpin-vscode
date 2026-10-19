/** Window focus refreshes at most this often (design: "at most once every 30 s"). */
export const FOCUS_INTERVAL_MS = 30_000;

/**
 * Runs one check at a time. A refresh asked for while a check runs is run once
 * after it, however many were asked for (coalesced). A focus refresh is dropped
 * when a check started less than 30 s ago, whatever started it. The clock is
 * injected so tests need no timers. `run` reports its own errors; one that throws
 * anyway never stops later refreshes.
 */
export class RefreshScheduler {
  private current: Promise<void> | undefined;
  private next: Promise<void> | undefined;
  private lastStart: number | undefined;
  private disposed = false;

  constructor(
    private readonly run: () => Promise<void>,
    private readonly now: () => number = Date.now,
    private readonly focusIntervalMs: number = FOCUS_INTERVAL_MS,
  ) {}

  /** Resolves when a check that started after this call has finished. */
  request(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.current) return this.start();
    this.next ??= this.current.then(() => {
      this.next = undefined;
      return this.start();
    });
    return this.next;
  }

  /** The window regained focus: refresh unless a check started within the interval. */
  requestOnFocus(): Promise<void> {
    if (this.lastStart !== undefined && this.now() - this.lastStart < this.focusIntervalMs) return Promise.resolve();
    return this.request();
  }

  get running(): boolean {
    return this.current !== undefined;
  }

  dispose(): void {
    this.disposed = true;
  }

  private start(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.lastStart = this.now();
    const tracked: Promise<void> = (async () => {
      try {
        await this.run();
      } catch {
        // run shows its own failure state; nothing to add here.
      }
    })().then(() => {
      if (this.current === tracked) this.current = undefined;
    });
    this.current = tracked;
    return tracked;
  }
}
