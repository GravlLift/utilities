export function abortSignalAny(signals: AbortSignal[]) {
  if ('any' in AbortSignal) {
    return (AbortSignal as { any(s: AbortSignal[]): AbortSignal }).any(signals);
  } else {
    const controller = new AbortController();

    const abortFn = () => {
      // Cleanup
      for (const signal of signals) {
        signal.removeEventListener('abort', abortFn);
      }
      if (!controller.signal.aborted) {
        try {
          controller.abort();
        } catch (e) {
          if (!(e instanceof Error) || e.name !== 'AbortError') {
            throw e;
          }
        }
      }
    };

    for (const signal of signals) {
      if (signal.aborted) {
        abortFn();
        break;
      }
      signal.addEventListener('abort', abortFn);
    }

    return controller.signal;
  }
}

export function abortSignalAll(signals: AbortSignal[]) {
  const controller = new AbortController();

  const unabortedSignals: AbortSignal[] = [];

  for (const signal of signals) {
    if (signal.aborted) {
      continue;
    }
    unabortedSignals.push(signal);

    const abortFn = () => {
      signal.removeEventListener('abort', abortFn);
      unabortedSignals.splice(unabortedSignals.indexOf(signal), 1);
      if (unabortedSignals.length < 1 && !controller.signal.aborted) {
        try {
          controller.abort();
        } catch (e) {
          if (!(e instanceof Error) || e.name !== 'AbortError') {
            throw e;
          }
        }
      }
    };
    signal.addEventListener('abort', abortFn);
  }

  return controller.signal;
}
