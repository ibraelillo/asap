export type FetchFn<T, D> = (params: D | never) => Promise<T>;

/**
 * Fetch a single resource avoiding race conditions
 */
export class SharedFetcher<T, D> {
  private cache: T | null = null;
  private inFlight: Promise<T> | null = null;

  constructor(
    private fetchFn: FetchFn<T, D>,
    private useCache = true,
  ) {}

  async get(params: Parameters<FetchFn<T, D>>[0]): Promise<T> {
    // If cached result exists and we want to reuse it
    if (this.cache && this.useCache) {
      return this.cache;
    }

    // If a fetch is already happening, return the same promise
    if (this.inFlight) {
      return this.inFlight;
    }

    // Start a new fetch
    this.inFlight = this.fetchFn(params)
      .then((result) => {
        this.cache = result;
        return result;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  clearCache() {
    this.cache = null;
  }
}

/**
 * Register fetchers to be used in race conditions
 */
export class FetcherRegistry {
  private registry = new Map<string, SharedFetcher<any, any>>();

  /**
   * Register a fetcher with a unique key
   */
  register<T, D>(
    key: string,
    fetchFn: FetchFn<T, D>,
    useCache = true,
  ): SharedFetcher<T, D> {
    if (this.registry.has(key)) {
      return this.registry.get(key)!;
    }

    const fetcher = new SharedFetcher(fetchFn, useCache);
    this.registry.set(key, fetcher);
    return fetcher;
  }

  /**
   * Get an existing fetcher by key
   */
  get<T, D>(key: string): SharedFetcher<T, D> | undefined {
    return this.registry.get(key);
  }

  /**
   * Clear all caches
   */
  clearAll() {
    for (const fetcher of this.registry.values()) {
      fetcher.clearCache();
    }
  }

  /**
   * Remove a fetcher completely
   */
  remove(key: string) {
    this.registry.delete(key);
  }
}
