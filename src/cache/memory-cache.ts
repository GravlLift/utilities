import ExpiryMap from 'expiry-map';
import { AbortSignalManager } from '../abort-signal-manager';
import { BaseCache, Cache } from './base-cache';

type CacheEntry<TCacheItem> = {
  promise: Promise<TCacheItem>;
  abortSignalManager: AbortSignalManager;
};

export class MemoryCache<
    TCacheItem,
    TKey,
    TTransformedKey = string,
    TAdditionalArgs extends unknown[] = [],
    TResult = TCacheItem
  >
  extends BaseCache<TCacheItem, TKey, TTransformedKey, TAdditionalArgs, TResult>
  implements Cache<TCacheItem, TKey, TAdditionalArgs>
{
  private readonly rollingExpiration: boolean;
  private readonly cache:
    | Map<TTransformedKey, CacheEntry<TCacheItem>>
    | ExpiryMap<TTransformedKey, CacheEntry<TCacheItem>>;
  private readonly maxEntries?: number;
  constructor(
    options: {
      cacheExpirationMs?: number;
      maxEntries?: number;
      rollingExpiration?: boolean;
      keyTransformer?: (key: TKey) => TTransformedKey;
    } & (
      | {
          fetchOneFn: (
            key: TKey,
            ...args: [...TAdditionalArgs, AbortSignal]
          ) => Promise<TCacheItem>;
        }
      | {
          fetchManyFn: (
            keys: TKey[],
            ...args: [...TAdditionalArgs, AbortSignal]
          ) => Promise<TResult[]>;
          resultSelector: (items: TResult[], key: TKey) => TCacheItem;
        }
    )
  ) {
    super(options);
    if (options.cacheExpirationMs == null) {
      this.cache = new Map();
    } else {
      this.cache = new ExpiryMap(options.cacheExpirationMs);
    }
    this.rollingExpiration = options.rollingExpiration ?? false;
  }

  protected getOne(
    key: TKey,
    ...args: [...TAdditionalArgs, AbortSignal]
  ): Promise<TCacheItem> {
    const transformedKey = this.keyTransformer(key);
    let cacheEntry = this.cache.get(transformedKey);

    const abortSignal = args[args.length - 1] as AbortSignal;
    if (abortSignal.aborted) {
      const error = new Error(`Operation was aborted`, {
        cause: abortSignal.reason,
      });
      error.name = 'AbortError';
      throw error;
    }

    const restArgs = args.slice(0, -1) as TAdditionalArgs;

    let abortSignalManager: AbortSignalManager;
    if (!cacheEntry) {
      abortSignalManager = new AbortSignalManager();
      let fetchPromise: Promise<TCacheItem>;
      if ('fetchOneFn' in this.fetcher) {
        fetchPromise = this.fetcher.fetchOneFn(
          key,
          ...restArgs,
          abortSignalManager.signal
        );
      } else {
        const selector = this.fetcher.resultSelector;
        fetchPromise = this.fetcher
          .fetchManyFn([key], ...restArgs, abortSignalManager.signal)
          .then((items) => selector(items, key));
      }

      fetchPromise = fetchPromise.catch((err) => {
        this.cache.delete(transformedKey);
        throw err;
      });

      cacheEntry = {
        promise: fetchPromise,
        abortSignalManager,
      };
      this.cache.set(transformedKey, cacheEntry);

      // Trim oversize entries
      while (this.maxEntries && this.cache.size > this.maxEntries) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
    }

    cacheEntry.abortSignalManager.addSignal(abortSignal);

    if (this.rollingExpiration) {
      // Re-set the cache item to refresh the expiration/position
      this.cache.delete(transformedKey);
      this.cache.set(transformedKey, cacheEntry);
    }

    return cacheEntry.promise;
  }

  protected getMany(
    keys: TKey[],
    ...args: [...TAdditionalArgs, AbortSignal]
  ): Map<TKey, Promise<TCacheItem>> {
    const abortSignal = args[args.length - 1] as AbortSignal;
    const restArgs = args.slice(0, -1) as TAdditionalArgs;

    if (abortSignal.aborted) {
      const error = new Error(`Operation was aborted`, {
        cause: abortSignal.reason,
      });
      error.name = 'AbortError';
      throw error;
    }

    const keyPromisesMap = new Map<TKey, CacheEntry<TCacheItem> | undefined>();
    for (const key of keys) {
      const transformedKey = this.keyTransformer(key);
      keyPromisesMap.set(key, this.cache.get(transformedKey));
    }

    const keysToFetch = Array.from(keyPromisesMap.entries())
      .filter(([, v]) => v == null)
      .map(([k]) => k);

    if (keysToFetch.length) {
      if ('fetchOneFn' in this.fetcher) {
        for (const key of keysToFetch) {
          const abortSignalManager = new AbortSignalManager(abortSignal);
          const transformedKey = this.keyTransformer(key);
          const cacheEntry = {
            promise: this.fetcher
              .fetchOneFn(key, ...restArgs, abortSignalManager.signal)
              .catch((err) => {
                this.cache.delete(transformedKey);
                throw err;
              }),
            abortSignalManager,
          };
          this.cache.set(transformedKey, cacheEntry);
          keyPromisesMap.set(key, cacheEntry);
        }
      } else {
        const abortSignalManager = new AbortSignalManager(abortSignal);
        const baseFetch = this.fetcher.fetchManyFn(
          keysToFetch,
          ...restArgs,
          abortSignalManager.signal
        );
        for (const key of keysToFetch) {
          const transformedKey = this.keyTransformer(key);
          const selector = this.fetcher.resultSelector;
          const cacheEntry = {
            promise: baseFetch
              .then((items) => selector(items, key))
              .catch((err) => {
                this.cache.delete(transformedKey);
                throw err;
              }),
            abortSignalManager,
          };
          this.cache.set(transformedKey, cacheEntry);
          keyPromisesMap.set(key, cacheEntry);
        }
      }
    }

    // Trim oversize entries
    while (this.maxEntries && this.cache.size > this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    const resultMap = new Map<TKey, Promise<TCacheItem>>();

    for (const [key, value] of keyPromisesMap) {
      if (value == null) {
        throw new Error('Unexpected null value in keyPromisesMap');
      }

      resultMap.set(key, value.promise);

      if (this.rollingExpiration) {
        const transformedKey = this.keyTransformer(key);
        // Re-set the cache item to refresh the expiration/position
        this.cache.delete(transformedKey);
        this.cache.set(transformedKey, value!);
      }
    }

    return resultMap;
  }

  public set(key: TKey, value: TCacheItem) {
    const transformedKey = this.keyTransformer(key);
    this.cache.set(transformedKey, {
      promise: Promise.resolve(value),
      abortSignalManager: new AbortSignalManager(),
    });
  }

  public delete(key: TKey) {
    const transformedKey = this.keyTransformer(key);
    this.cache.delete(transformedKey);
  }
}
