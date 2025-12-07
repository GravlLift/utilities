/**
 * Tracks individual promises for each caller while sharing the underlying fetch operation
 */
export class SharedFetchTracker<T> {
  private readonly individualPromises = new Map<
    AbortSignal,
    {
      promise: Promise<T>;
      resolve: (value: T) => void;
      reject: (reason: any) => void;
    }
  >();
  private sharedResult: T | undefined;
  private sharedError: any;
  private isResolved = false;
  private isRejected = false;

  addCaller(signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
      return Promise.reject(new DOMException(undefined, 'AbortError'));
    }

    // If we already have a result, return it
    if (this.isResolved && this.sharedResult !== undefined) {
      return Promise.resolve(this.sharedResult);
    }

    if (this.isRejected) {
      return Promise.reject(this.sharedError);
    }

    // Create individual promise for this caller
    let resolve: (value: T) => void;
    let reject: (reason: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const promiseInfo = { promise, resolve: resolve!, reject: reject! };
    this.individualPromises.set(signal, promiseInfo);

    // Handle abortion for this specific caller
    const abortHandler = () => {
      const info = this.individualPromises.get(signal);
      if (info && !this.isResolved && !this.isRejected) {
        info.reject(new DOMException(undefined, 'AbortError'));
        this.individualPromises.delete(signal);
      }
    };

    signal.addEventListener('abort', abortHandler, { once: true });

    return promise;
  }

  resolveAll(result: T): void {
    if (this.isResolved || this.isRejected) return;

    this.isResolved = true;
    this.sharedResult = result;

    this.individualPromises.forEach(({ resolve, promise }, signal) => {
      if (!signal.aborted) {
        resolve(result);
      }
    });
    this.individualPromises.clear();
  }

  rejectAll(error: any): void {
    if (this.isResolved || this.isRejected) return;

    this.isRejected = true;
    this.sharedError = error;

    this.individualPromises.forEach(({ reject }, signal) => {
      if (!signal.aborted) {
        reject(error);
      }
    });
    this.individualPromises.clear();
  }

  hasActiveCalls(): boolean {
    return this.individualPromises.size > 0;
  }

  cleanup(): void {
    this.individualPromises.clear();
  }
}
