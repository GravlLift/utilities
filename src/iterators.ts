export async function asyncIteratorAllResults<T, TReturn, TNext>(
  iterator: AsyncIterator<T, TReturn, TNext>
): Promise<T[]> {
  let done = false;
  const results: T[] = [];
  while (!done) {
    const next = await iterator.next();
    if (next.done) {
      done = true;
    } else {
      results.push(next.value);
    }
  }
  return results;
}
