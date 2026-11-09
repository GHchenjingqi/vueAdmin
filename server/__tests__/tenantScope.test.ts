// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { Op } from 'sequelize'

const { mockAddHook } = vi.hoisted(() => ({
  mockAddHook: vi.fn(),
}))

vi.mock('../config/database.js', () => ({
  default: {
    addHook: mockAddHook,
  },
}))

import { runInTenant } from '../modules/tenant/context.js'
import { registerTenantScope } from '../modules/tenant/hooks/sequelizeTenantScope.js'

const SERVER_ROOT = fileURLToPath(new URL('..', import.meta.url))

function hook(name: string): Function {
  registerTenantScope()
  const found = mockAddHook.mock.calls.find((c) => c[0] === name)?.[1]
  expect(found, `缺少 ${name} 钩子`).toBeDefined()
  return found as Function
}

const TENANTED = { rawAttributes: { tenantId: { type: 'INTEGER' }, name: { type: 'STRING' } } }
const PLAIN = { rawAttributes: { name: { type: 'STRING' } } }

/** 钩子注入的是 { [Op.and]: [原 where, { tenantId }] }，取回注入的租户约束 */
function injectedTenantId(where: any): number | undefined {
  const list = where?.[Op.and]
  if (!Array.isArray(list)) return where?.tenantId
  return list[list.length - 1]?.tenantId
}

function hasAndConstraint(where: any, original: Record<string, unknown>): boolean {
  const list = where?.[Op.and]
  return Array.isArray(list) && list[0] === original
}

describe('tenantScope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('hook logic', () => {
    it('registerTenantScope 注册 beforeFind 和 beforeCreate hooks', () => {
      registerTenantScope()
      expect(mockAddHook).toHaveBeenCalledWith('beforeFind', expect.any(Function))
      expect(mockAddHook).toHaveBeenCalledWith('beforeCreate', expect.any(Function))
    })

    it('注册 bulk 钩子，覆盖 Model.update/destroy 这类不经过实例的路径', () => {
      registerTenantScope()
      const names = mockAddHook.mock.calls.map((c) => c[0])
      expect(names).toEqual(expect.arrayContaining(['beforeBulkUpdate', 'beforeBulkDestroy', 'beforeBulkCreate']))
    })

    it('beforeFind 非请求上下文不过滤', () => {
      const beforeFind = hook('beforeFind')

      const options = { model: TENANTED, where: { status: 1 } }
      beforeFind(options)
      expect(options.where).toEqual({ status: 1 })
    })

    it('无 tenantId 属性的模型不过滤', () => {
      const beforeFind = hook('beforeFind')

      const options = { model: PLAIN, where: {} }
      beforeFind(options)
      expect(options.where).toEqual({})
    })

    it('租户上下文内按当前租户过滤，并保留原条件', () => {
      const beforeFind = hook('beforeFind')

      const original = { status: 1 }
      const options = { model: TENANTED, where: original }
      runInTenant({ tenantId: 7 }, () => beforeFind(options))

      expect(hasAndConstraint(options.where, original)).toBe(true)
      expect(injectedTenantId(options.where)).toBe(7)
    })

    it('原 where 为空时直接注入租户约束', () => {
      const beforeFind = hook('beforeFind')

      const options: { model: unknown; where: unknown } = { model: TENANTED, where: undefined }
      runInTenant({ tenantId: 7 }, () => beforeFind(options))
      expect(options.where).toEqual({ tenantId: 7 })
    })

    it('按 id 直查（findByPk 形态）也被租户约束，跨租户读不到即 404', () => {
      const beforeFind = hook('beforeFind')

      const options = { model: TENANTED, where: { id: 5 } }
      runInTenant({ tenantId: 2 }, () => beforeFind(options))

      expect(injectedTenantId(options.where)).toBe(2)
      expect(options.where[Op.and][0]).toEqual({ id: 5 })
    })

    it('旧 token 缺 tenantId 时兜底 -1（不匹配任何行），不静默放开全量', () => {
      const beforeFind = hook('beforeFind')

      const options = { model: TENANTED, where: { id: 5 } }
      runInTenant({ tenantId: null }, () => beforeFind(options))
      expect(injectedTenantId(options.where)).toBe(-1)
    })

    it('平台超管（bypass）不受过滤', () => {
      const beforeFind = hook('beforeFind')

      const original = { id: 5 }
      const options = { model: TENANTED, where: original }
      runInTenant({ tenantId: 2, bypass: true }, () => beforeFind(options))
      expect(options.where).toBe(original)
    })

    it('bulk update / bulk destroy 同样注入租户约束', () => {
      const beforeBulkUpdate = hook('beforeBulkUpdate')
      const beforeBulkDestroy = hook('beforeBulkDestroy')

      for (const fn of [beforeBulkUpdate, beforeBulkDestroy]) {
        const original = { status: 0 }
        const options = { model: TENANTED, where: original }
        runInTenant({ tenantId: 3 }, () => fn(options))
        expect(injectedTenantId(options.where)).toBe(3)
        expect(hasAndConstraint(options.where, original)).toBe(true)
      }
    })

    it('bulk 钩子对无租户属性的模型不动 where', () => {
      const beforeBulkUpdate = hook('beforeBulkUpdate')

      const original = { status: 0 }
      const options = { model: PLAIN, where: original }
      runInTenant({ tenantId: 3 }, () => beforeBulkUpdate(options))
      expect(options.where).toBe(original)
    })

    it('beforeCreate 补写当前租户，已有值不覆盖', () => {
      const beforeCreate = hook('beforeCreate')

      const fresh = { constructor: TENANTED, tenantId: null as number | null }
      const preset = { constructor: TENANTED, tenantId: 9 }
      runInTenant({ tenantId: 4 }, () => {
        beforeCreate(fresh)
        beforeCreate(preset)
      })
      expect(fresh.tenantId).toBe(4)
      expect(preset.tenantId).toBe(9)
    })

    it('beforeBulkCreate 为每条记录补写当前租户', () => {
      const beforeBulkCreate = hook('beforeBulkCreate')

      const rows = [
        { constructor: TENANTED, tenantId: null },
        { constructor: TENANTED, tenantId: 9 },
      ]
      runInTenant({ tenantId: 4 }, () => beforeBulkCreate(rows))
      expect(rows.map((r) => r.tenantId)).toEqual([4, 9])
    })

    it('bulkCreate 在无租户上下文时保持原值（脚本/任务写入不受影响）', () => {
      const beforeBulkCreate = hook('beforeBulkCreate')

      const rows = [{ constructor: TENANTED, tenantId: null }]
      beforeBulkCreate(rows)
      expect(rows[0].tenantId).toBeNull()
    })
  })

  describe('表级租户策略', () => {
    const declared = (model: string) => readFileSync(join(SERVER_ROOT, 'models', `${model}.ts`), 'utf8').includes('declare tenantId:')

    it('按归属人可判定的业务表声明 tenantId，交由钩子隔离', () => {
      for (const model of ['User', 'Department', 'Notice', 'NoticeRead', 'Message', 'Log', 'Workflow', 'WorkflowInstance', 'ApprovalTask']) {
        expect(declared(model), `${model} 应声明 tenantId`).toBe(true)
      }
    })

    it('菜单/角色按租户复制后必须隔离（迭代 2 T11）', () => {
      for (const model of ['Menu', 'Role']) {
        expect(declared(model), `${model} 应声明 tenantId`).toBe(true)
      }
    })

    it('关联表与平台级配置表不隔离：关联行随两端主表中已隔离的一侧收敛', () => {
      for (const model of ['UserRole', 'RoleMenu', 'DictType', 'DictData', 'Setting', 'Task', 'AiProvider']) {
        expect(declared(model), `${model} 不应声明 tenantId`).toBe(false)
      }
    })
  })
})
