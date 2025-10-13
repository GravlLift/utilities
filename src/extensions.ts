import { DateTime } from 'luxon';

declare global {
  interface Array<T> {
    sortBy(): this;
    sortBy(
      sortOn: (obj: T) => number | string | boolean | Date | DateTime
    ): this;

    sortByDesc(): this;
    sortByDesc(
      sortOn: (obj: T) => number | string | boolean | Date | DateTime
    ): this;

    distinct(): this;
    distinct(compareFn: (objA: T, objB: T) => boolean): this;

    groupBy<TGroup>(selector: (source: T) => TGroup): Map<TGroup, T[]>;

    sum(): T extends number ? T : never;
    sum(selector: (source: T) => number): number;

    average(): T extends number ? T : never;
    average(selector: (source: T) => number): number;

    weightedAverage(weights: number[]): T extends number ? T : never;

    maxBy(
      selector: (source: T) => number | string | boolean | Date | DateTime
    ): T;

    minBy(
      selector: (source: T) => number | string | boolean | Date | DateTime
    ): T;

    count(selector: (source: T) => boolean): number;

    cast<TCast>(): TCast[];

    hasDuplicates(): boolean;
    hasDuplicates(
      selector: (source: T) => number | string | boolean | Date | DateTime
    ): boolean;

    orderEqual(other: Array<T>): boolean;

    chunk(chunkSize: number): T[][];

    rankBy(
      sortOn: (obj: T) => number | string | boolean | Date | DateTime
    ): { rank: number; value: T }[];

    rankByDesc(
      sortOn: (obj: T) => number | string | boolean | Date | DateTime
    ): { rank: number; value: T }[];
  }

  interface String {
    hashCode(): number;
  }
}

if (!String.prototype.hashCode) {
  String.prototype.hashCode = function (this: string) {
    let hash = 0,
      i,
      chr;
    if (this.length === 0) return hash;
    for (i = 0; i < this.length; i++) {
      chr = this.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  };
}

if (!Array.prototype.sortBy) {
  Array.prototype.sortBy = function <TSource>(
    this: TSource[],
    sortOn: (obj: TSource) => number | string | boolean | Date | DateTime = (
      obj: TSource
    ): number | string | boolean | Date | DateTime =>
      obj as TSource extends number | string | boolean | Date | DateTime
        ? TSource
        : never
  ): TSource[] {
    return [...this].sort((a: TSource, b: TSource) => {
      const aResult = sortOn(a);
      const bResult = sortOn(b);

      if (aResult < bResult) {
        return -1;
      }

      if (aResult > bResult) {
        return 1;
      }

      return 0;
    });
  };
}

if (!Array.prototype.sortByDesc) {
  Array.prototype.sortByDesc = function <TSource>(
    this: TSource[],
    sortOn: (obj: TSource) => number | string | boolean | Date | DateTime = (
      obj: TSource
    ): number | string | boolean | Date | DateTime =>
      obj as TSource extends number | string | boolean | Date | DateTime
        ? TSource
        : never
  ): TSource[] {
    return [...this].sort((a: TSource, b: TSource) => {
      const aResult = sortOn(a);
      const bResult = sortOn(b);

      if (aResult < bResult) {
        return 1;
      }

      if (aResult > bResult) {
        return -1;
      }

      return 0;
    });
  };
}

if (!Array.prototype.distinct) {
  Array.prototype.distinct = function <TSource>(
    this: TSource[],
    compareFn: ((objA: TSource, objB: TSource) => boolean) | null = null
  ): TSource[] {
    if (compareFn == null) {
      return [...new Set(this)];
    } else {
      const newArr: TSource[] = [];
      for (const obj of this) {
        if (!newArr.find((existingObj) => compareFn(existingObj, obj))) {
          newArr.push(obj);
        }
      }
      return newArr;
    }
  };
}

if (!Array.prototype.groupBy) {
  Array.prototype.groupBy = function <TSource, TGroup>(
    this: TSource[],
    selector: (source: TSource) => TGroup
  ): Map<TGroup, TSource[]> {
    const groups = new Map<TGroup, TSource[]>();
    this.forEach((obj: TSource) => {
      const key = selector(obj);
      groups.set(key, [...(groups.get(key) || []), obj]);
    });
    return groups;
  };
}

if (!Array.prototype.sum) {
  Array.prototype.sum = function <TSource>(
    this: TSource[],
    selector: ((source: TSource) => number) | null = null
  ): number {
    if (selector) {
      return this.reduce(
        (previousValue: number, currentValue: TSource) =>
          previousValue + selector(currentValue),
        0
      );
    } else {
      return this.reduce(
        (previousValue: number, currentValue: TSource) =>
          previousValue + +(currentValue ?? 0),
        0
      );
    }
  };
}

if (!Array.prototype.average) {
  Array.prototype.average = function <TSource>(
    this: TSource[],
    selector: ((source: TSource) => number) | null = null
  ): number {
    if (selector) {
      return this.sum(selector) / this.length;
    } else {
      return this.sum() / this.length;
    }
  };
}

if (!Array.prototype.maxBy) {
  Array.prototype.maxBy = function <TSource>(
    this: TSource[],
    selector: (source: TSource) => number | string | boolean | Date | DateTime
  ): TSource {
    return this.reduce((previousValue: TSource, currentValue: TSource) => {
      const val1 = selector(previousValue);
      const val2 = selector(currentValue);
      return val1 > val2 ? previousValue : currentValue;
    });
  };
}

if (!Array.prototype.minBy) {
  Array.prototype.minBy = function <TSource>(
    this: TSource[],
    selector: (source: TSource) => number | string | boolean | Date | DateTime
  ): TSource {
    return this.reduce((previousValue: TSource, currentValue: TSource) => {
      const val1 = selector(previousValue);
      const val2 = selector(currentValue);
      return val1 < val2 ? previousValue : currentValue;
    });
  };
}

if (!Array.prototype.count) {
  Array.prototype.count = function <TSource>(
    this: TSource[],
    selector: (source: TSource) => boolean
  ): number {
    let count = 0;
    for (const item of this) {
      if (selector(item)) {
        count++;
      }
    }
    return count;
  };
}

if (!Array.prototype.cast) {
  Array.prototype.cast = function <T>(this: unknown[]): T[] {
    return this as T[];
  };
}

if (!Array.prototype.hasDuplicates) {
  Array.prototype.hasDuplicates = function <T>(
    this: T[],
    selector: ((source: T) => unknown) | null = null
  ): boolean {
    if (selector) {
      const array = this.map((i) => selector(i));
      return new Set(array).size !== array.length;
    } else {
      return new Set(this).size !== this.length;
    }
  };
}

if (!Array.prototype.orderEqual) {
  Array.prototype.orderEqual = function <T>(this: T[], other: T[]): boolean {
    return (
      this?.length === other?.length && this.every((e, i) => e === other[i])
    );
  };
}

if (!Array.prototype.chunk) {
  Array.prototype.chunk = function <T>(this: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < this.length; i += chunkSize) {
      chunks.push(this.slice(i, i + chunkSize));
    }
    return chunks;
  };
}

if (!Array.prototype.weightedAverage) {
  Array.prototype.weightedAverage = function (
    this: number[],
    weights: number[]
  ) {
    return (
      this.reduce((p, c, i) => p + c * weights[i], 0) /
      weights.reduce((a, b) => a + b, 0)
    );
  };
}

if (!Array.prototype.rankBy) {
  Array.prototype.rankBy = function <T>(
    this: T[],
    rankOn: (obj: T) => number | string | boolean | Date | DateTime = (
      obj: T
    ): number | string | boolean | Date | DateTime =>
      obj as T extends number | string | boolean | Date | DateTime ? T : never
  ) {
    return this.map((value, _, allValues) => {
      const xRankOn = rankOn(value);
      return {
        rank: allValues.filter((w) => rankOn(w) < xRankOn).length + 1,
        value: value,
      };
    });
  };
}

if (!Array.prototype.rankByDesc) {
  Array.prototype.rankByDesc = function <T>(
    this: T[],
    rankOn: (obj: T) => number | string | boolean | Date | DateTime = (
      obj: T
    ): number | string | boolean | Date | DateTime =>
      obj as T extends number | string | boolean | Date | DateTime ? T : never
  ) {
    return this.map((value, _, allValues) => {
      const xRankOn = rankOn(value);
      return {
        rank: allValues.filter((w) => rankOn(w) > xRankOn).length + 1,
        value: value,
      };
    });
  };
}
