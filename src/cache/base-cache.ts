export interface DeprecatedCache<
  TCacheItem,
  TKey,
  TAdditionalArgs extends unknown[] = []
> {
  get(
    key: TKey,
    ...args: [...TAdditionalArgs, AbortSignal?]
  ): Promise<TCacheItem>;
  get(
    keys: TKey[],
    ...args: [...TAdditionalArgs, AbortSignal?]
  ): Promise<TCacheItem>[];
  get(
    keyOrKeys: TKey | TKey[],
    ...args: [...TAdditionalArgs, AbortSignal?]
  ): Promise<TCacheItem> | Promise<TCacheItem>[];
  set(key: TKey, value: TCacheItem): void;
  delete(key: TKey): void;
}

export interface Cache<
  TCacheItem,
  TKey,
  TAdditionalArgs extends unknown[] = []
> {
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
  ): Promise<TCacheItem> | Map<TKey, Promise<TCacheItem>>;
  set(key: TKey, value: TCacheItem): void;
  delete(key: TKey): void;
}

export interface HasableCache<TKey> {
  has(key: TKey): boolean;
}

export abstract class BaseCache<
  TCacheItem,
  TKey,
  TTransformedKey = string,
  TAdditionalArgs extends unknown[] = [],
  TResult = TCacheItem
> implements Cache<TCacheItem, TKey, TAdditionalArgs>
{
  protected readonly keyTransformer: (key: TKey) => TTransformedKey;
  protected readonly fetcher:
    | {
        fetchOneFn: (
          key: TKey,
          ...args: [...TAdditionalArgs, AbortSignal]
        ) => Promise<TCacheItem>;
      }
    | {
        fetchManyFn: (
          key: TKey[],
          ...args: [...TAdditionalArgs, AbortSignal]
        ) => Promise<TResult[]>;
        resultSelector: (items: TResult[], key: TKey) => TCacheItem;
      };
  constructor(
    options: {
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
    this.fetcher = options;
    if (options.keyTransformer) {
      this.keyTransformer = options.keyTransformer;
    } else {
      this.keyTransformer = (k) => k as unknown as TTransformedKey;
    }
  }

  public get(
    key: TKey,
    ...args: [...TAdditionalArgs, AbortSignal?]
  ): Promise<TCacheItem>;
  public get(
    keys: TKey[],
    ...args: [...TAdditionalArgs, AbortSignal?]
  ): Map<TKey, Promise<TCacheItem>>;
  public get(
    keyOrKeys: TKey | TKey[],
    ...args: [...TAdditionalArgs, AbortSignal?]
  ): Promise<TCacheItem> | Map<TKey, Promise<TCacheItem>> {
    const abortSignal: AbortSignal =
      (args.length > 0
        ? (args[args.length - 1] as AbortSignal | undefined)
        : null) ?? new AbortController().signal;
    if (keyOrKeys instanceof Array) {
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

  protected abstract getOne(
    key: TKey,
    ...args: [...TAdditionalArgs, AbortSignal]
  ): Promise<TCacheItem>;
  protected abstract getMany(
    keys: TKey[],
    ...args: [...TAdditionalArgs, AbortSignal]
  ): Map<TKey, Promise<TCacheItem>>;
  abstract set(key: TKey, value: TCacheItem): void;
  abstract delete(key: TKey): void;
}
