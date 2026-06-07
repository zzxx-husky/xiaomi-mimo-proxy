/**
 * 缓存管理器
 * 根据配置选择使用内存缓存或Redis缓存
 */

import { getReasoningCache } from './reasoning-cache.js';
import { RedisReasoningCache } from './redis-cache.js';

let cacheInstance = null;

/**
 * 获取缓存实例
 * @param {Object} options - 配置选项
 * @param {boolean} options.useRedis - 是否使用Redis
 * @param {string} options.redisUrl - Redis连接地址
 * @returns {Object} 缓存实例
 */
export async function getCache(options = {}) {
  if (cacheInstance) {
    return cacheInstance;
  }

  if (options.useRedis) {
    console.log('Using Redis cache');
    const redisCache = new RedisReasoningCache(options);
    await redisCache.connect(options.redisUrl);
    cacheInstance = redisCache;
  } else {
    console.log('Using memory cache');
    cacheInstance = getReasoningCache(options);
  }

  return cacheInstance;
}

/**
 * 获取缓存实例（同步版本，用于内存缓存）
 */
export function getCacheSync(options = {}) {
  if (cacheInstance) {
    return cacheInstance;
  }

  console.log('Using memory cache');
  cacheInstance = getReasoningCache(options);
  return cacheInstance;
}

/**
 * 重置缓存实例（用于测试）
 */
export function resetCache() {
  cacheInstance = null;
}

export default {
  getCache,
  getCacheSync,
  resetCache
};
