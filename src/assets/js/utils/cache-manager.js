/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 * 
 * Cache Manager - Reduces database I/O by caching frequently accessed data
 */

class CacheManager {
    constructor() {
        this.cache = new Map();
        this.ttl = new Map(); // Time-to-live for each cache entry
        this.defaultTTL = 5000; // 5 seconds default TTL
    }

    /**
     * Set a value in cache with optional TTL
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - Time to live in milliseconds (optional)
     */
    set(key, value, ttl = this.defaultTTL) {
        this.cache.set(key, value);

        // Clear existing timeout if any
        if (this.ttl.has(key)) {
            clearTimeout(this.ttl.get(key));
        }

        // Set new timeout for cache invalidation
        const timeout = setTimeout(() => {
            this.cache.delete(key);
            this.ttl.delete(key);
        }, ttl);

        this.ttl.set(key, timeout);
    }

    /**
     * Get a value from cache
     * @param {string} key - Cache key
     * @returns {any} Cached value or undefined
     */
    get(key) {
        return this.cache.get(key);
    }

    /**
     * Check if a key exists in cache
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    has(key) {
        return this.cache.has(key);
    }

    /**
     * Invalidate (delete) a cache entry
     * @param {string} key - Cache key
     */
    invalidate(key) {
        if (this.ttl.has(key)) {
            clearTimeout(this.ttl.get(key));
            this.ttl.delete(key);
        }
        this.cache.delete(key);
    }

    /**
     * Clear all cache entries
     */
    clear() {
        // Clear all timeouts
        for (const timeout of this.ttl.values()) {
            clearTimeout(timeout);
        }
        this.cache.clear();
        this.ttl.clear();
    }

    /**
     * Get cache size
     * @returns {number}
     */
    size() {
        return this.cache.size;
    }
}

// Export singleton instance
const cacheManager = new CacheManager();
export default cacheManager;
