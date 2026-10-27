/**
 * 两级缓存端到端冒烟（需 REDIS_ENABLED=true 且 redis-server 可达）
 * 验证：L1 命中 -> loader 仅调用 1 次；L2 命中 -> 新建实例(L1 为空)可从 Redis 回填；clear 级联 L2。
 */
import { createCache } from '../utils/cache.js'
import { getRedis } from '../config/redis.js'
import config from '../config/index.js'

async function main() {
  if (!config.redis.enabled || !getRedis()) {
    console.error('[SKIP] Redis 未启用或不可达，跳过 L2 冒烟（设置 REDIS_ENABLED=true 并重跑）')
    process.exit(0)
  }

  const ns = `smoke-${Date.now()}`
  const a = createCache<{ v: number }>({ namespace: ns, disabled: false, maxAgeMs: 60_000 })
  const b = createCache<{ v: number }>({ namespace: ns, disabled: false, maxAgeMs: 60_000 })

  // 1) L1 命中：loader 只调用一次
  const loader = async () => ({ v: Math.floor(Math.random() * 1e9) })
  const r1 = await a.getOrSet('k', loader)
  const r2 = await a.getOrSet('k', loader)
  if (r1.v !== r2.v) throw new Error('L1 命中但返回值不一致')
  console.log('[OK] L1 命中一致:', r1.v)

  // 2) L2 命中：b 是全新 L1，应从 Redis 取到 a 写入的值
  const r3 = await b.getOrSet('k', async () => ({ v: -1 }))
  if (r3.v !== r1.v) throw new Error(`L2 未命中 Redis（期望 ${r1.v}，实际 ${r3.v}）`)
  console.log('[OK] L2(Redis) 跨实例回填一致:', r3.v)

  // 3) del 级联 L2：b 删除后再次 getOrSet 应重新加载（新值）
  await b.del('k')
  const r4 = await b.getOrSet('k', async () => ({ v: r1.v + 1 }))
  if (r4.v !== r1.v + 1) throw new Error('del 未级联 L2')
  console.log('[OK] del 级联 L2 生效:', r4.v)

  // 4) clear 级联 L2：clear 只清本实例 L1 + Redis 命名空间（无法触达其它实例的 L1），
  //    故用全新实例(空 L1)验证 Redis 侧已被清空 -> 走 loader 得到新值
  await a.clear()
  const c = createCache<{ v: number }>({ namespace: ns, disabled: false, maxAgeMs: 60_000 })
  const r5 = await c.getOrSet('k', async () => ({ v: 999 }))
  if (r5.v !== 999) throw new Error('clear 未级联 L2')
  console.log('[OK] clear 级联 L2 生效:', r5.v)

  // 清理
  await c.clear()
  console.log('\n[PASS] 两级缓存冒烟全部通过 ✅')
  process.exit(0)
}

main().catch((e) => {
  console.error('[FAIL]', e)
  process.exit(1)
})
