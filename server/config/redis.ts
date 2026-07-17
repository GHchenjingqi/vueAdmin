/**
 * Redis 连接管理
 *
 * 设计要点：
 * - 单例模式（getRedis 返回值应缓存）
 * - 连接失败时返回 null，调用方自行决定 fallback 行为
 * - 支持 Sentinel/Cluster 模式（通过 REDIS_URL 配置）
 * - 提供优雅关闭方法 closeRedis()
 */
import Redis from 'ioredis'
import config from './index.js'
import { logInfo, logError } from '../utils/fileLogger.js'

let redis: Redis | null = null
let connecting = false

/**
 * 获取 Redis 实例
 * Redis 不可用时返回 null（自动降级到内存限流）
 */
export function getRedis(): Redis | null {
  if (redis) return redis
  if (!config.redis.enabled) return null
  if (connecting) return null // 防止并发创建多个连接

  connecting = true
  try {
    redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          logError(`Redis 连接失败已达 ${times} 次，停止重试，降级到内存模式`)
          return null
        }
        return Math.min(times * 200, 2000)
      },
      lazyConnect: true,
      enableOfflineQueue: false,
    })

    redis.on('connect', () => logInfo('Redis 连接成功'))
    redis.on('error', (err) => {
      logError(`Redis 错误: ${err.message}`)
      redis = null
    })
    redis.on('close', () => {
      logInfo('Redis 连接关闭')
      redis = null
    })

    return redis
  } catch (err: any) {
    logError(`Redis 初始化失败: ${err.message}`)
    return null
  } finally {
    connecting = false
  }
}

/**
 * 优雅关闭 Redis 连接
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit()
    redis = null
    logInfo('Redis 连接已优雅关闭')
  }
}