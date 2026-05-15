import { ICachePlugin } from '@azure/msal-node';
import { nodeFsTokenPersister } from 'halo-infinite-api/token-persisters';

export const cachePlugin = (
  msalCacheTokenName: string = 'msal.tokenCache',
): ICachePlugin => ({
  beforeCacheAccess: async (tokenCacheContext) => {
    const serializedCache =
      await nodeFsTokenPersister.load<object>(msalCacheTokenName);
    if (serializedCache) {
      tokenCacheContext.tokenCache.deserialize(JSON.stringify(serializedCache));
    }
  },
  afterCacheAccess: async (tokenCacheContext) => {
    if (!tokenCacheContext.cacheHasChanged) {
      return;
    }
    const serializedCache = tokenCacheContext.tokenCache.serialize();
    if (serializedCache) {
      await nodeFsTokenPersister.save(
        msalCacheTokenName,
        JSON.parse(serializedCache),
      );
    }
  },
});
