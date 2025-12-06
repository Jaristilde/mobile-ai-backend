import crypto from 'crypto';
import { CacheEntry, CacheOptions } from '../types/express';
import { AppError } from '../middleware/error.middleware';

export abstract class BaseService {
  private static cacheStore = new Map<string, CacheEntry>();
  protected static DEFAULT_CACHE_EXPIRATION = 3600; // 1 hour in seconds
  protected static MAX_CACHE_EXPIRATION = 86400; // 24 hours in seconds

  // Cleanup expired cache entries every minute
  private static initCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cacheStore.entries()) {
        if (now > entry.expiresAt) {
          this.cacheStore.delete(key);
        }
      }
    }, 60000);
  }

  // Initialize cache cleanup
  static {
    this.initCacheCleanup();
  }

  protected static async getCachedResponse(
    key: string,
    options: CacheOptions = {}
  ): Promise<string | null> {
    if (options.skipCache) {
      return null;
    }

    try {
      const entry = this.cacheStore.get(key);
      if (!entry) {
        return null;
      }

      // Check if entry is expired
      if (Date.now() > entry.expiresAt) {
        this.cacheStore.delete(key);
        return null;
      }

      return entry.value;
    } catch (error) {
      return null;
    }
  }

  protected static async setCachedResponse(
    key: string,
    value: string,
    options: CacheOptions = {}
  ): Promise<void> {
    if (options.skipCache) {
      return;
    }

    try {
      const ttl = Math.min(
        options.ttl || this.DEFAULT_CACHE_EXPIRATION,
        this.MAX_CACHE_EXPIRATION
      );

      this.cacheStore.set(key, {
        value,
        expiresAt: Date.now() + ttl * 1000,
      });
    } catch (error) {
      throw new AppError('Cache set error', 500);
    }
  }

  protected static async clearCache(pattern: string): Promise<void> {
    try {
      const regex = new RegExp(pattern.replace('*', '.*'));
      for (const key of this.cacheStore.keys()) {
        if (regex.test(key)) {
          this.cacheStore.delete(key);
        }
      }
    } catch (error) {
      throw new AppError('Cache clear error', 500);
    }
  }

  protected static generateCacheKey(prefix: string, params: any[]): string {
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex');
    return `${prefix}:${hash}`;
  }
}
