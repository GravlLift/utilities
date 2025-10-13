/**
 * Manages multiple AbortSignals for a cache key and creates a combined signal
 * that only aborts when ALL individual signals are aborted.
 */
export class AbortSignalManager {
  private readonly signals = new Set<AbortSignal>();
  private readonly controller = new AbortController();

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  constructor(initialSignals?: AbortSignal | AbortSignal[]) {
    // Bind the abort handler to maintain 'this' context
    this.checkAndAbortIfNeeded = this.checkAndAbortIfNeeded.bind(this);
    if (initialSignals) {
      if (Array.isArray(initialSignals)) {
        initialSignals.forEach((signal) => this.addSignal(signal));
      } else {
        this.addSignal(initialSignals);
      }
    }
  }

  addSignal(signal: AbortSignal): void {
    if (signal.aborted) {
      return; // Don't add signals if we're already aborted or the signal is already aborted
    }

    this.signals.add(signal);
    signal.addEventListener('abort', this.checkAndAbortIfNeeded, {
      once: true,
    });
  }

  removeSignal(signal: AbortSignal): void {
    if (this.signals.has(signal)) {
      this.signals.delete(signal);
      signal.removeEventListener('abort', this.checkAndAbortIfNeeded);

      // Check if we should abort now that this signal is removed
      this.checkAndAbortIfNeeded();
    }
  }

  private checkAndAbortIfNeeded(): void {
    // Check if all remaining signals are aborted
    const allAborted =
      this.signals.size === 0 ||
      Array.from(this.signals).every((signal) => signal.aborted);

    if (allAborted && !this.signal.aborted) {
      this.controller.abort();
      this.cleanup();
    }
  }

  hasActiveSignals(): boolean {
    return this.signals.size > 0 && !this.signal.aborted;
  }

  cleanup(): void {
    this.signals.forEach((signal) => {
      signal.removeEventListener('abort', this.checkAndAbortIfNeeded);
    });
    this.signals.clear();
  }
}
