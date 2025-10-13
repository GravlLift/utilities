import { MemoryCache } from './memory-cache';
import { ResolvablePromise } from '../resolvable-promise';

describe('MemoryCache AbortSignal behavior', () => {
  let cache: MemoryCache<string, string>;
  let fetchFn: jest.Mock;

  beforeEach(() => {
    fetchFn = jest.fn();
    cache = new MemoryCache({
      fetchOneFn: fetchFn,
    });
  });

  test('should abort fetch only when all callers abort', async () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();

    // Setup fetch function to be controllable
    const fetchPromise = new ResolvablePromise<string>();
    fetchFn.mockReturnValue(fetchPromise);

    // Start two concurrent requests
    const promise1 = cache.get('test-key', controller1.signal);
    const promise2 = cache.get('test-key', controller2.signal);

    expect(promise1).toBe(promise2); // Both should be the same promise

    // Verify fetchFn was called only once
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Abort the first caller - this should not affect the fetch
    controller1.abort();

    // The fetch should still be active since controller2 hasn't aborted
    expect(fetchFn.mock.calls[0][1]).not.toEqual(
      expect.objectContaining({ aborted: true })
    );

    // Now abort the second caller
    controller2.abort();

    // Now the combined signal should be aborted since all callers aborted
    expect(fetchFn.mock.calls[0][1]).toEqual(
      expect.objectContaining({ aborted: true })
    );
    fetchPromise.reject(new Error('AbortError'));

    // The promises for both callers should be rejected with AbortError
    await expect(promise1).rejects.toThrow('AbortError');
    await expect(promise2).rejects.toThrow('AbortError');
  });

  test('should complete successfully when some but not all callers abort', async () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();

    // Setup fetch function with ResolvablePromise for better control
    const fetchPromise = new ResolvablePromise<string>();
    fetchFn.mockReturnValue(fetchPromise);

    // Start two concurrent requests
    cache.get('test-key', controller1.signal);
    const promise2 = cache.get('test-key', controller2.signal);

    // Abort only the first caller
    controller1.abort();

    // The fetch should still be active since controller2 hasn't aborted
    expect(fetchFn.mock.calls[0][1]).not.toEqual(
      expect.objectContaining({ aborted: true })
    );

    // Resolve the fetch for the remaining caller
    fetchPromise.resolve('result-for-test-key');

    // The second caller should still get the result
    const result2 = await promise2;
    expect(result2).toBe('result-for-test-key');
  });

  test('should resolve all callers when fetch completes successfully', async () => {
    // Setup controllable fetch promise
    const fetchPromise = new ResolvablePromise<string>();
    fetchFn.mockReturnValue(fetchPromise);

    // Start two concurrent requests
    const controller1 = new AbortController();
    cache.get('test-key', controller1.signal);

    const controller2 = new AbortController();
    const promise2 = cache.get('test-key', controller2.signal);

    // Abort one caller
    controller1.abort();

    // Add a third caller after the first one aborted
    const controller3 = new AbortController();
    const promise3 = cache.get('test-key', controller3.signal);

    // Resolve the fetch
    fetchPromise.resolve('success-result');

    // Remaining callers should get the result
    expect(await promise2).toBe('success-result');
    expect(await promise3).toBe('success-result');

    // Verify fetch was only called once
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test('should return cached value immediately after successful fetch', async () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();

    // Setup controllable fetch promise
    const fetchPromise = new ResolvablePromise<string>();
    fetchFn.mockReturnValue(fetchPromise);

    // Start first request
    const promise1 = cache.get('test-key', controller1.signal);

    // Resolve the fetch
    fetchPromise.resolve('cached-result');

    // Wait for the result
    const result1 = await promise1;
    expect(result1).toBe('cached-result');

    // Now make a second request - this should return the cached value immediately
    const promise2 = cache.get('test-key', controller2.signal);
    const result2 = await promise2;

    expect(result2).toBe('cached-result');
    // Fetch should still only have been called once
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test('should handle already aborted signals gracefully', async () => {
    const controller = new AbortController();
    controller.abort(); // Abort before making the request

    fetchFn.mockImplementation((key: string) => {
      return Promise.resolve(`result-for-${key}`);
    });

    // Request with already aborted signal should reject immediately
    expect(() => cache.get('test-key', controller.signal)).toThrow(
      'Operation was aborted'
    );

    // Fetch function should not have been called
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test('should cache results after successful fetch', async () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();

    fetchFn.mockImplementation((key: string) => {
      return Promise.resolve(`result-for-${key}`);
    });

    // First request
    const result1 = await cache.get('test-key', controller1.signal);
    expect(result1).toBe('result-for-test-key');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Second request for same key should use cached result
    const result2 = await cache.get('test-key', controller2.signal);
    expect(result2).toBe('result-for-test-key');
    expect(fetchFn).toHaveBeenCalledTimes(1); // Still only called once
  });
});
