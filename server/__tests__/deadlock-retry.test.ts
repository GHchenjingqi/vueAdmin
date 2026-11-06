// @vitest-environment node
/**
 * 统一死锁重试的纯函数回归（无 DB 依赖）
 *
 * 覆盖过去各服务私有实现无法直接测试的部分：驱动包装形态的原生错误码、
 * 放宽后的 Sequelize 错误类型、非死锁不重试、重试上限与自定义次数。
 */
import { describe, it, expect } from 'vitest'
import { isDeadlock, withDeadlockRetry } from '../modules/shop/services/deadlockRetry.js'

function wrappedDeadlock(init: Record<string, unknown> = {}): Error {
  return Object.assign(new Error('Deadlock found when trying to get lock; try restarting transaction'), {
    name: 'SequelizeDatabaseError',
    ...init,
  })
}

describe('isDeadlock', () => {
  it('识别 parent.code = ER_LOCK_DEADLOCK（即使 name 不是 SequelizeDatabaseError）', () => {
    const err = Object.assign(new Error('wrapped by another layer'), {
      name: 'SequelizeTransactionError',
      parent: { code: 'ER_LOCK_DEADLOCK', errno: 1213 },
    })
    expect(isDeadlock(err)).toBe(true)
  })

  it('识别 original.errno = 1213（无 message 关键字）', () => {
    const err = { name: 'CustomWrapper', message: 'transaction rolled back', original: { errno: 1213 } }
    expect(isDeadlock(err)).toBe(true)
  })

  it('识别三种放宽后的 Sequelize 错误类型 + deadlock 消息', () => {
    for (const name of ['SequelizeDatabaseError', 'SequelizeTransactionError', 'SequelizeTimeoutError']) {
      expect(isDeadlock(wrappedDeadlock({ name }))).toBe(true)
    }
  })

  it('不误判普通错误、无关 errno 与非对象', () => {
    expect(isDeadlock(new Error('connection lost'))).toBe(false)
    expect(isDeadlock({
      name: 'SequelizeUniqueConstraintError',
      message: 'Duplicate entry for key',
      parent: { errno: 1062, code: 'ER_DUP_ENTRY' },
    })).toBe(false)
    expect(isDeadlock(Object.assign(new Error('deadlock-ish text'), { name: 'TypeError' }))).toBe(false)
    expect(isDeadlock(null)).toBe(false)
    expect(isDeadlock('deadlock')).toBe(false)
  })
})

describe('withDeadlockRetry', () => {
  it('前两次死锁后成功：共调用 3 次并返回结果', async () => {
    let calls = 0
    const result = await withDeadlockRetry(async () => {
      calls++
      if (calls < 3) throw wrappedDeadlock()
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  it('非死锁错误立即抛出，不重试', async () => {
    let calls = 0
    const err = new Error('validation failed')
    await expect(withDeadlockRetry(async () => {
      calls++
      throw err
    })).rejects.toBe(err)
    expect(calls).toBe(1)
  })

  it('达到重试上限后抛出最后一次死锁错误', async () => {
    let calls = 0
    const mk = () => wrappedDeadlock({ parent: { code: 'ER_LOCK_DEADLOCK' } })
    await expect(withDeadlockRetry(async () => {
      calls++
      throw mk()
    }, 3)).rejects.toMatchObject({ name: 'SequelizeDatabaseError' })
    expect(calls).toBe(3)
  })

  it('自定义 tries 生效，首次成功不产生额外调用', async () => {
    let calls = 0
    const result = await withDeadlockRetry(async () => {
      calls++
      return 42
    }, 2)
    expect(result).toBe(42)
    expect(calls).toBe(1)
  })
})
