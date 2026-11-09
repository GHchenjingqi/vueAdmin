// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryTypes } from 'sequelize'
import type { QueryInterface } from 'sequelize'

interface FakeOptions {
  /** 缺少租户列的表（模拟未执行历史迁移的库） */
  missingTenantColumn?: string[]
  affectedRows?: number
  ambiguousDepartments?: Array<{ id: number; tenantIds: string }>
}

interface Recorded {
  sql: string
}

function makeQi(options: FakeOptions = {}): QueryInterface & { recorded: Recorded[] } {
  const recorded: Recorded[] = []
  const columnOf = (table: string) => (options.missingTenantColumn?.includes(table) ? {} : { id: {}, tenantId: {} })

  const sequelize = {
    // 模仿 Sequelize：带 type: SELECT 时直接返回行数组，否则返回 [结果, 元信息]
    async query(sql: string, queryOptions?: { type?: string }) {
      recorded.push({ sql })
      if (queryOptions?.type === QueryTypes.SELECT) {
        return options.ambiguousDepartments ?? []
      }
      return [undefined, { affectedRows: options.affectedRows ?? 0 }]
    },
  }

  return {
    recorded,
    sequelize: sequelize as any,
    describeTable: async (table: string) => columnOf(table) as any,
  } as unknown as QueryInterface & { recorded: Recorded[] }
}

const { up, down } = await import('../migrations/20261109_000001_reattribute-tenant-owned-rows.js')

describe('20261109_000001_reattribute-tenant-owned-rows', () => {
  let warn: ReturnType<typeof vi.spyOn>
  let info: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    info = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const updates = (qi: { recorded: Recorded[] }) => qi.recorded.map((r) => r.sql.replace(/\s+/g, ' ').trim()).filter((s) => s.startsWith('UPDATE'))

  it('按归属用户重认定四类表，且每条 UPDATE 都带“不一致才改写”条件以保证幂等', async () => {
    const qi = makeQi({ affectedRows: 3 })
    await up(qi)

    const sql = updates(qi)
    expect(sql).toHaveLength(5)

    const byTable = Object.fromEntries(sql.map((s) => [s.match(/^UPDATE `(\w+)`/)![1], s]))
    expect(Object.keys(byTable)).toEqual(expect.arrayContaining(['notices', 'notice_reads', 'messages', 'logs', 'departments']))

    expect(byTable.notices).toContain('JOIN `users` u ON u.id = t.publisherId')
    expect(byTable.notice_reads).toContain('JOIN `users` u ON u.id = t.userId')
    expect(byTable.messages).toContain('JOIN `users` u ON u.id = COALESCE(t.toUserId, t.fromUserId)')
    expect(byTable.logs).toContain('JOIN `users` u ON u.id = t.userId')

    for (const statement of sql) {
      // 幂等来自“仅改写租户不一致的行”
      expect(statement).toContain('<>')
    }
  })

  it('部门仅在成员同租户时改写，跨租户部门保持原值并告警', async () => {
    const qi = makeQi({ ambiguousDepartments: [{ id: 12, tenantIds: '1,2' }] })
    await up(qi)

    const dept = updates(qi).find((s) => s.startsWith('UPDATE `departments`'))!
    expect(dept).toContain('HAVING COUNT(DISTINCT `tenantId`) = 1')

    expect(warn.mock.calls.flat().join(' ')).toContain('departments #12 的成员跨租户(1,2)')
  })

  it('users 缺少租户列时整体跳过（不产生任何写入）', async () => {
    const qi = makeQi({ missingTenantColumn: ['users'] })
    await up(qi)

    expect(qi.recorded).toHaveLength(0)
    expect(warn.mock.calls.flat().join(' ')).toContain('跳过租户重认定')
  })

  it('单表缺少租户列时只跳过该表，其余照常处理', async () => {
    const qi = makeQi({ missingTenantColumn: ['messages', 'departments'] })
    await up(qi)

    const tables = updates(qi).map((s) => s.match(/^UPDATE `(\w+)`/)![1])
    expect(tables).toEqual(['notices', 'notice_reads', 'logs'])
    expect(warn.mock.calls.flat().join(' ')).toContain('messages 缺少 tenantId 列')
  })

  it('第二次执行不影响任何行（幂等由 <> 条件保证）', async () => {
    const qi = makeQi({ affectedRows: 0 })
    await up(qi)
    expect(info.mock.calls.flat().join(' ')).not.toContain('重认定')
  })

  it('down 不做回滚（回滚会把行送回错误租户，造成跨租户可见）', async () => {
    await expect(down()).resolves.toBeUndefined()
  })
})
