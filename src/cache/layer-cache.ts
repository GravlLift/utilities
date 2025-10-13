import ExpiryMap from 'expiry-map';
import { ResolvablePromise } from '../resolvable-promise';
import { Cache, HasableCache } from './base-cache';

export type NullableFetcher<
  TCacheItem,
  TKey,
  TAdditionalArgs extends unknown[] = [],
  TResult = TCacheItem
> =
  | {
      fetchOneFn: (
        key: TKey,
        ...args: [...TAdditionalArgs, AbortSignal]
      ) => Promise<TCacheItem | null>;
    }
  | {
      fetchManyFn: (
        keys: TKey[],
        ...args: [...TAdditionalArgs, AbortSignal]
      ) => Promise<TResult[]>;
      resultSelector: (items: TResult[], key: TKey) => TCacheItem | null;
    };

export type NonNullableFetcher<
  TCacheItem,
  TKey,
  TAdditionalArgs extends unknown[],
  TResult
> =
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
    };

export type Fetchers<
  TCacheItem,
  TKey,
  TAdditionalArgs extends unknown[],
  TResult
> = [
  ...NullableFetcher<TCacheItem, TKey, TAdditionalArgs, TResult>[],
  NonNullableFetcher<TCacheItem, TKey, TAdditionalArgs, TResult>
];

export class LayerCache<
  TCacheItem,
  TKey,
  TTransformedKey = string,
  TAdditionalArgs extends unknown[] = [],
  TResult = TCacheItem
> implements Cache<TCacheItem, TKey, TAdditionalArgs>, HasableCache<TKey>
{
  protected readonly keyTransformer: (key: TKey) => TTransformedKey;
  private readonly rollingExpiration: boolean;
  private readonly cache:
    | Map<TTransformedKey, Promise<TCacheItem>>
    | ExpiryMap<TTransformedKey, Promise<TCacheItem>>;
  private readonly maxEntries?: number;
  private readonly fetchers: Fetchers<
    TCacheItem,
    TKey,
    TAdditionalArgs,
    TResult
  >;

  constructor(options: {
    cacheExpirationMs?: number;
    maxEntries?: number;
    rollingExpiration?: boolean;
    keyTransformer?: (key: TKey) => TTransformedKey;
    fetchers: Fetchers<TCacheItem, TKey, TAdditionalArgs, TResult>;
  }) {
    this.fetchers = options.fetchers;
    if (options.cacheExpirationMs == null) {
      this.cache = new Map();
    } else {
      this.cache = new ExpiryMap(options.cacheExpirationMs);
    }
    this.rollingExpiration = options.rollingExpiration ?? false;
    if (options.keyTransformer) {
      this.keyTransformer = options.keyTransformer;
    } else {
      this.keyTransformer = (k) => k as unknown as TTransformedKey;
    }
  }

  get(
    key: TKey,
    ...args: [...TAdditionalArgs, AbortSignal?]
  ): Promise<TCacheItem>;
  get(
    keys: TKey[],
    ...args: [...TAdditionalArgs, AbortSignal?]
  ): Map<TKey, Promise<TCacheItem>>;
  get(
    keyOrKeys: TKey | TKey[],
    ...args: [...TAdditionalArgs, AbortSignal?]
  ): Promise<TCacheItem> | Map<TKey, Promise<TCacheItem>> {
    this.prune();

    const abortSignal: AbortSignal =
      (args.length > 0
        ? (args[args.length - 1] as AbortSignal | undefined)
        : null) ?? new AbortController().signal;
    if (Array.isArray(keyOrKeys)) {
      return this.getMany(
        keyOrKeys,
        ...(args.slice(0, -1) as TAdditionalArgs),
        abortSignal
      );
    } else {
      return this.getOne(
        keyOrKeys,
        ...(args.slice(0, -1) as TAdditionalArgs),
        abortSignal
      );
    }
  }

  private getOne(
    key: TKey,
    ...args: [...TAdditionalArgs, AbortSignal]
  ): Promise<TCacheItem> {
    let promise = this.cache.get(this.keyTransformer(key));
    if (promise) {
      if (this.rollingExpiration) {
        const transformedKey = this.keyTransformer(key);
        // Re-set the cache item to refresh the expiration/position
        this.cache.delete(transformedKey);
        this.cache.set(transformedKey, promise);
      }
      return promise;
    }

    promise = (async () => {
      for (const fetch of this.fetchers) {
        let item: TCacheItem | null;
        if ('fetchOneFn' in fetch) {
          item = await fetch.fetchOneFn(key, ...args);
        } else {
          const result = await fetch.fetchManyFn([key], ...args);
          item = fetch.resultSelector(result, key);
        }
        if (item !== null) {
          return item;
        }
      }

      throw new Error('No fetcher returned a valid item.');
    })();
    this.cache.set(this.keyTransformer(key), promise);
    return promise;
  }

  private getMany(
    keys: TKey[],
    ...args: [...TAdditionalArgs, AbortSignal]
  ): Map<TKey, Promise<TCacheItem>> {
    const keyPromisesMap = new Map<TKey, Promise<TCacheItem> | undefined>();
    for (const key of keys) {
      keyPromisesMap.set(key, this.cache.get(this.keyTransformer(key)));
    }

    const keysToFetch = Array.from(keyPromisesMap.entries())
      .filter(([, v]) => v == null)
      .map(([k]) => k);

    if (keysToFetch.length) {
      const additionalPromises = new Map<TKey, ResolvablePromise<TCacheItem>>(
        keysToFetch.map((key) => [key, new ResolvablePromise()])
      );
      for (const [key, promise] of additionalPromises) {
        keyPromisesMap.set(key, promise);
        this.cache.set(this.keyTransformer(key), promise);
      }
      this.getManyChain(additionalPromises, this.fetchers, args);
    }

    return keyPromisesMap as Map<TKey, Promise<TCacheItem>>;
  }

  private getManyChain(
    keyPromisesMap: Map<TKey, ResolvablePromise<TCacheItem>>,
    fetchers: Fetchers<TCacheItem, TKey, TAdditionalArgs, TResult>,
    args: [...TAdditionalArgs, AbortSignal]
  ): void {
    if (keyPromisesMap.size === 0) {
      return;
    }

    if (!fetchers.length) {
      throw new Error('No fetcher returned a valid item.');
    }

    const [fetcher, ...rest] = fetchers;
    if ('fetchOneFn' in fetcher) {
      const fetchOnFn = fetcher.fetchOneFn;
      Promise.all(
        Array.from(keyPromisesMap).map(([key, resolvablePromise]) =>
          fetchOnFn(key, ...args).then((item) => {
            if (item !== null) {
              resolvablePromise.resolve(item);
              keyPromisesMap.delete(key);
            }
          })
        )
      ).then(() => {
        if (keyPromisesMap.size) {
          this.getManyChain(
            keyPromisesMap,
            rest as Fetchers<TCacheItem, TKey, TAdditionalArgs, TResult>,
            args
          );
        }
      });
    } else {
      const resultSelector = fetcher.resultSelector;
      if (!resultSelector) {
        throw new Error('No result selector provided for fetcher.');
      }
      fetcher
        .fetchManyFn(Array.from(keyPromisesMap.keys()), ...args)
        .then((results) => {
          for (const [key, promise] of keyPromisesMap) {
            const result = resultSelector(results, key);
            if (result !== null) {
              promise.resolve(result);
              keyPromisesMap.delete(key);
            }
          }
          if (keyPromisesMap.size) {
            this.getManyChain(
              keyPromisesMap,
              rest as Fetchers<TCacheItem, TKey, TAdditionalArgs, TResult>,
              args
            );
          }
        });
    }
  }

  has(key: TKey): boolean {
    return this.cache.has(this.keyTransformer(key));
  }

  set(key: TKey, value: TCacheItem): void {
    this.cache.set(this.keyTransformer(key), Promise.resolve(value));
    this.prune();
  }

  delete(key: TKey): void {
    this.cache.delete(this.keyTransformer(key));
    this.prune();
  }

  private prune(): void {
    while (this.maxEntries && this.cache.size > this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
}
