/**
 * Given a type, return a type that is the same but with all properties
 * marked as optional, included nested properties of objects and arrays.
 */
export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends object
    ? RecursivePartial<T[P]>
    : T[P];
};

/**
 * Given a type, flatten all the keys into a union of dot-notated strings.
 *
 * @example
 * type Test = {
 *   a: {
 *     b: {
 *       c: string
 *     }
 *   }
 * }
 *
 * type Result = FlattenObjectKeysToDotNotation<Test> // "a" | "a.b" | "a.b.c"
 */
export type FlattenObjectKeysToDotNotation<
  T extends Record<PropertyKey, unknown>,
  Key extends keyof T = keyof T,
  TExcept = never
> = Key extends string
  ?
      | `${Key}`
      | (T[Key] extends TExcept
          ? never
          : Extract<T[Key], Record<PropertyKey, unknown>> extends never
          ? never
          :
              | `${Key}.${FlattenObjectKeysToDotNotation<
                  Extract<T[Key], Record<PropertyKey, unknown>>
                >}`)
  : never;

/**
 * Given a type, flatten all the keys into a union of bracket-notated strings.
 *
 * @example
 * type Test = {
 *   a: {
 *     b: {
 *       c: string
 *     }
 *   }
 * }
 *
 * type Result = FlattenObjectKeys<Test> // "a" | "a[b]" | "a[b][c]"
 */
export type FlattenObjectKeysToBracketNotation<
  T extends Record<PropertyKey, unknown>,
  Key extends keyof T = keyof T,
  TExcept = never,
  TIsBracketed extends boolean = false
> = Key extends string
  ?
      | (TIsBracketed extends true ? `[${Key}]` : `${Key}`)
      | (T[Key] extends TExcept
          ? never
          : Extract<T[Key], Record<PropertyKey, unknown>> extends never
          ? never
          : `${TIsBracketed extends true
              ? '['
              : ''}${Key}${TIsBracketed extends true
              ? ']'
              : ''}${FlattenObjectKeysToBracketNotation<
              Extract<T[Key], Record<PropertyKey, unknown>>,
              KeysOfUnion<Extract<T[Key], Record<PropertyKey, unknown>>>,
              TExcept,
              true
            >}`)
  : never;

/**
 * Given a type, flatten all the keys and properties into a single-level dot-notated type.
 *
 * @example
 * type Test = {
 *  a: {
 *   b: {
 *    c: string
 *   }
 *  }
 * }
 *
 * type Result = FlattenedType<Test> // { "a.b.c": string } } }
 */
export type FlattenedTypeToDotNotated<
  T extends Record<PropertyKey, unknown>,
  TExcept = never
> = UnionToIntersection<
  PickByDotNotation<T, FlattenObjectKeysToDotNotation<T, keyof T, TExcept>>
>;

/**
 * Given a type, flatten all the keys and properties into a single-level bracket-notated type.
 *
 * @example
 * type Test = {
 *  a: {
 *   b: {
 *    c: string
 *   }
 *  }
 * }
 *
 * type Result = FlattenedType<Test> // { "a[b][c]": string } } }
 */
export type FlattenedTypeToBracketNotated<
  T extends Record<PropertyKey, unknown>,
  TExcept = never
> = UnionToIntersection<
  PickByBracketNotation<
    T,
    FlattenObjectKeysToBracketNotation<T, keyof T, TExcept>
  >
>;

/**
 * Given a path or union of paths, extra the type of the value at that path.
 *
 * @example
 * type Test = {
 *   a: {
 *     b: {
 *       c: string
 *     }
 *   }
 * }
 *
 * type Result = PickByDotNotation<Test, "a.b.c"> // { "a.b.c": string }
 */
export type PickByDotNotation<
  TObject,
  TPath extends string,
  TPrefix extends string = ''
> = TPath extends `${infer TKey extends keyof Extract<
  TObject,
  Record<PropertyKey, unknown>
> &
  string}.${infer TRest}`
  ? PickByDotNotation<
      Extract<TObject, Record<PropertyKey, unknown>>[TKey],
      TRest,
      TKey
    >
  : TPath extends keyof Extract<TObject, Record<PropertyKey, unknown>>
  ? {
      [K in `${TPrefix extends '' ? '' : `${TPrefix}.`}${TPath}`]: Exclude<
        Extract<TObject, Record<PropertyKey, unknown>>[TPath],
        Record<PropertyKey, unknown>
      >;
    }
  : never;

/**
 * Given a path or union of paths, extract the type of the value at that path.
 *
 * @example
 * type Test = {
 *   a: {
 *     b: {
 *       c: string
 *     }
 *   }
 * }
 *
 * type Result = PickByBracketNotation<Test, "a[b][c]"> // { "a[b][c]": string }
 */
export type PickByBracketNotation<
  TObject,
  TPath extends string,
  TPrefix extends string = ''
> = TPath extends `${infer TKey extends keyof Extract<
  TObject,
  Record<PropertyKey, unknown>
> &
  string}[${infer TNext}]${infer TRest}`
  ? PickByBracketNotation<
      Extract<TObject, Record<PropertyKey, unknown>>[TKey],
      `${TNext}${TRest}`,
      `${TPrefix extends '' ? '' : `${TPrefix}[`}${TKey}${TPrefix extends ''
        ? ''
        : ']'}`
    >
  : TPath extends KeysOfUnion<Extract<TObject, Record<PropertyKey, unknown>>>
  ? TPath extends keyof Extract<TObject, Record<PropertyKey, unknown>>
    ? {
        [K in `${TPrefix extends ''
          ? ''
          : `${TPrefix}[`}${TPath}${TPrefix extends '' ? '' : ']'}` as Exclude<
          Extract<TObject, Record<PropertyKey, unknown>>[TPath],
          Record<PropertyKey, unknown>
        > extends never
          ? never
          : K]: Exclude<
          Extract<TObject, Record<PropertyKey, unknown>>[TPath],
          Record<PropertyKey, unknown>
        >;
      }
    : {
        [K in `${TPrefix extends ''
          ? ''
          : `${TPrefix}[`}${TPath}${TPrefix extends '' ? '' : ']'}`]?: Exclude<
          Extract<TObject, { [K2 in TPath]?: unknown }>[TPath],
          Record<PropertyKey, unknown>
        >;
      }
  : never;

/**
 * Convert a type union into an intersection.
 * @see https://stackoverflow.com/a/50375286/11096668
 */
export type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

type NullablePropertiesAsNonNullable<T> = {
  [K in keyof T as T[K] extends NonNullable<T[K]> ? never : K]: NonNullable<
    T[K]
  >;
};

/**
 * Convert a union to a tuple.
 * @see https://github.com/microsoft/TypeScript/issues/13298#issuecomment-707364842
 */
export type UnionToTuple<T> = (
  (T extends unknown ? (t: T) => T : never) extends infer U
    ? (U extends unknown ? (u: U) => unknown : never) extends (
        v: infer V
      ) => unknown
      ? V
      : never
    : never
) extends (_: infer _R) => infer W
  ? [...UnionToTuple<Exclude<T, W>>, W]
  : [];

export type TupleToUnion<T extends ReadonlyArray<unknown>> = T[number];

/**
 * Given an object type, return a union of types including all possible combinations of
 * the type's properties (excluding empty object).
 *
 * @example
 * type Test = {
 *   a: string
 *   b: string
 *   c: string
 * }
 *
 * type Result = PropertyCombinations<Test> // { a: string; b: string; c: string } | { a: string; b: string } | { a: string; c: string } | { b: string; c: string } | { a: string } | { b: string } | { c: string }
 */
type PropertyCombinations<T extends Record<PropertyKey, unknown>> =
  UnionToTuple<keyof T> extends [infer A extends keyof T, ...infer B]
    ?
        | { [K in A]: T[K] }
        | (B extends (keyof T)[]
            ?
                | PropertyCombinations<{ [K in B[number]]: T[K] }>
                | ({
                    [K in A]: T[K];
                  } & PropertyCombinations<{ [K in B[number]]: T[K] }>)
            : never)
    : never;

/**
 * Given a type, return a union of types including all possible combinations of
 * types with nullable properties present as non-nullable or absent from the type.
 *
 * @example
 * type Test = {
 *   a: string | undefined
 *   b: string
 *   c: string | undefined
 * }
 *
 * type Result = Concrete<Test> // { a: string; b: string; c: string } | { a: string; b: string } | { b: string; c: string } | { b: string }
 */
export type Concrete<T> =
  | {
      [K in keyof T as T[K] extends NonNullable<T[K]> ? K : never]: T[K];
    }
  | ({
      [K in keyof T as T[K] extends NonNullable<T[K]> ? K : never]: T[K];
    } & PropertyCombinations<NullablePropertiesAsNonNullable<T>>);

type Enumerate<
  N extends number,
  Acc extends number[] = []
> = Acc['length'] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc['length']]>;

export type IntRange<F extends number, T extends number> = Exclude<
  Enumerate<T>,
  Enumerate<F>
>;

/**
 * Given a union of types, return all keys from all types
 */
export type KeysOfUnion<T> = T extends T ? keyof T : never;

export type SpreadableClassShape<T extends abstract new (...args: any) => any> =
  {
    [K in keyof InstanceType<T> as K extends string
      ? InstanceType<T>[K] extends Function
        ? never // exclude prototype methods
        : K
      : never]: InstanceType<T>[K];
  };
