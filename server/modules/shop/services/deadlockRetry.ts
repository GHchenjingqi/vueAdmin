/**
 * MySQL 死锁重试（shop / storefront 各写服务的统一实现）
 *
 * 背景：并发事务在索引间隙锁上互等时 MySQL 抛 ER_LOCK_DEADLOCK(1213)，
 * 事务已整体回滚，重放整个事务是安全的。此前 4 个服务各有一份私有实现，
 * 其中 3 份只认 `name === 'SequelizeDatabaseError'`，会漏判驱动包装后的
 * 原生错误码，且重试无退避、次数仅 3 次，高并发下容易反复相撞。
 *
 * 约束：调用方必须保证事务内**没有不可重放的外部副作用**（如外部支付通道
 * 调用），否则重试会造成重复扣款/重复退款。refundService 已用
 * invokeProviderOnce 保证外部调用最多一次，见该文件注释。
 */

interface NativeError {
  code?: string
  errno?: number
}

interface SequelizeLikeError {
  name?: string
  message?: string
  parent?: NativeError
  original?: NativeError
}

/** 判定是否为可重试的 MySQL 死锁（优先用驱动透出的原生错误码） */
export function isDeadlock(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as SequelizeLikeError
  const native = e.parent ?? e.original
  if (native?.code === 'ER_LOCK_DEADLOCK' || native?.errno === 1213) return true
  return (
    /deadlock/i.test(e.message ?? '') &&
    (e.name === 'SequelizeDatabaseError' ||
      e.name === 'SequelizeTransactionError' ||
      e.name === 'SequelizeTimeoutError')
  )
}

/** 在死锁时以有限次数重试整个事务；带指数退避与随机抖动避免高并发反复相撞 */
export async function withDeadlockRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      if (isDeadlock(e) && i < tries - 1) {
        lastErr = e
        const backoffMs = 10 * 2 ** i + Math.floor(Math.random() * 15)
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
        continue
      }
      throw e
    }
  }
  throw lastErr
}
