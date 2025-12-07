export function isAbortError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      (error instanceof DOMException &&
        error.code === DOMException.ABORT_ERR) ||
      (error instanceof AggregateError &&
        Array.from(error.errors).every(isAbortError)))
  );
}
