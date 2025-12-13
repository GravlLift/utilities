import { Cache } from './base-cache';
import { MemoryCache } from './memory-cache';

/** During the course of a request, return the promise, but remove it from
 * cache as soon as the request finishes. Good for requests that will be
 * persisted on disk cache. */
export class NoCache<
    TCacheItem,
    TKey,
    TTransformedKey = string,
    TAdditionalArgs extends unknown[] = [],
    TResult = TCacheItem
  >
  extends MemoryCache<
    TCacheItem,
    TKey,
    TTransformedKey,
    TAdditionalArgs,
    TResult
  >
  implements Cache<TCacheItem, TKey, TAdditionalArgs>
{
  constructor(
    opts: {
      maxEntries?: number;
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
    super(opts);
  }

  protected override getOne(
    key: TKey,
    ...args: [...TAdditionalArgs, AbortSignal]
  ): Promise<TCacheItem> {
    const promise = super.getOne(key, ...args);
    promise.finally(() => {
      this.delete(key);
    });
    return promise;
  }

  protected override getMany(
    keys: TKey[],
    ...args: [...TAdditionalArgs, AbortSignal]
  ): Map<TKey, Promise<TCacheItem>> {
    const map = super.getMany(keys, ...args);
    for (const [key, promise] of map) {
      promise.finally(() => {
        this.delete(key);
      });
    }
    return map;
  }
}
