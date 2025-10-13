import {
  EventEmitter,
  FailureReason,
  IPolicy,
  IRetryBackoffContext,
  IRetryContext,
  IRetryPolicyConfig,
  Policy,
} from 'cockatiel';
import { ExecuteWrapper } from 'cockatiel/dist/common/Executor';
import { neverAbortedSignal } from 'cockatiel/dist/common/abort';

const delay = (duration: number, unref: boolean) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, duration);
    if (unref) {
      timer.unref();
    }
  });

interface IAsyncBackoffFactory<T> {
  /**
   * Returns the first backoff duration.
   */
  next(context: T): Promise<IAsyncBackoff<T>>;
}

export class AsyncBackoffRetryPolicy implements IPolicy<IRetryContext> {
  declare readonly _altReturn: never;

  private readonly onGiveUpEmitter = new EventEmitter<FailureReason<unknown>>();
  private readonly onRetryEmitter = new EventEmitter<
    FailureReason<unknown> & { delay: number; attempt: number }
  >();

  /**
   * @inheritdoc
   */
  public readonly onSuccess;

  /**
   * @inheritdoc
   */
  public readonly onFailure;

  /**
   * Emitter that fires when we retry a call, before any backoff.
   *
   */
  public readonly onRetry = this.onRetryEmitter.addListener;

  /**
   * Emitter that fires when we're no longer retrying a call and are giving up.
   */
  public readonly onGiveUp = this.onGiveUpEmitter.addListener;

  constructor(
    private options: Readonly<
      Omit<IRetryPolicyConfig, 'backoff'> & {
        backoff: IAsyncBackoffFactory<IRetryBackoffContext<unknown>>;
      }
    >,
    private readonly executor: ExecuteWrapper
  ) {
    this.onSuccess = this.executor.onSuccess;
    this.onFailure = this.executor.onFailure;
  }

  /**
   * When retrying, a referenced timer is created. This means the Node.js event
   * loop is kept active while we're delaying a retried call. Calling this
   * method on the retry builder will unreference the timer, allowing the
   * process to exit even if a retry might still be pending.
   */
  public dangerouslyUnref() {
    return new AsyncBackoffRetryPolicy(
      { ...this.options, unref: true },
      this.executor.clone()
    );
  }

  /**
   * Executes the given function with retries.
   * @param fn Function to run
   * @returns a Promise that resolves or rejects with the function results.
   */
  public async execute<T>(
    fn: (context: IRetryContext) => PromiseLike<T> | T,
    signal = neverAbortedSignal
  ): Promise<T> {
    const factory: IAsyncBackoffFactory<IRetryBackoffContext<unknown>> =
      this.options.backoff;
    for (let retries = 0; ; retries++) {
      const result = await this.executor.invoke(fn, {
        attempt: retries,
        signal,
      });
      if (typeof result === 'object' && 'success' in result) {
        return result.success;
      }

      if (!signal.aborted && retries < this.options.maxAttempts) {
        const context = { attempt: retries + 1, signal, result };
        const backoff = await factory.next(context);
        const delayDuration = backoff.duration;
        const delayPromise = delay(delayDuration, !!this.options.unref);
        // A little sneaky reordering here lets us use Sinon's fake timers
        // when we get an emission in our tests.
        this.onRetryEmitter.emit({
          ...result,
          delay: delayDuration,
          attempt: retries + 1,
        });
        await delayPromise;
        continue;
      }

      this.onGiveUpEmitter.emit(result);
      if ('error' in result) {
        throw result.error;
      }

      return result.value;
    }
  }
}
type AsyncDelegateBackoffFn<T, S = void> = (
  context: T,
  state?: S
) => Promise<
  | {
      delay: number;
      state: S;
    }
  | number
>;

interface IAsyncBackoff<T> extends IAsyncBackoffFactory<T> {
  /**
   * Returns the number of milliseconds to wait for this backoff attempt.
   */
  readonly duration: number;
}
export class AsyncDelegateBackoff<T, S = void>
  implements IAsyncBackoffFactory<T>
{
  /**
   * Backoff that delegates to a user-provided function. The function takes
   * the backoff context, and can optionally take (and return) a state value
   * that will be passed into subsequent backoff requests.
   */
  constructor(private readonly fn: AsyncDelegateBackoffFn<T, S>) {}

  /**
   * @inheritdoc
   */
  public next(context: T) {
    return instance(this.fn).next(context);
  }
}

const instance = <T, S>(
  fn: AsyncDelegateBackoffFn<T, S>,
  state?: S,
  current = 0
): IAsyncBackoff<T> => ({
  duration: current,
  async next(context: T) {
    const result = await fn(context, state);
    return typeof result === 'number'
      ? instance(fn, state, result)
      : instance(fn, result.state, result.delay);
  },
});

export function asyncRetry(
  policy: Policy,
  opts: {
    backoff: IAsyncBackoffFactory<IRetryBackoffContext<unknown>>;
    maxAttempts?: number;
  }
) {
  return new AsyncBackoffRetryPolicy(
    { backoff: opts.backoff, maxAttempts: opts.maxAttempts ?? Infinity },
    new ExecuteWrapper(policy.options.errorFilter, policy.options.resultFilter)
  );
}
