import { describe, it, expect } from 'vitest'
import { Op } from 'sequelize'
import Department from '../models/Department.js'
import Message from '../models/Message.js'
import Menu from '../models/Menu.js'
import { runInTenant, getTenantContext } from '../modules/tenant/context.js'

/**
 * 背景（P0 根因）：
 * 迁移 20260901_000003 给 24 张业务表加了 tenant_id 列（设计意图全面租户隔离），
 * 但只有 6 个模型映射了 tenantId 属性。Sequelize 全局 beforeFind 钩子（sequelizeTenantScope.ts）
 * 用 `if (!Model?.rawAttributes?.tenantId) return` 判断 —— 未映射属性的模型，其所有查询
 * （Department/Message/Notice/Dict/Settings/Tasks...）完全不受租户约束，造成跨租户数据泄漏，
 * 且 beforeCreate 也不会写入 tenantId。
 *
 * 本测试针对已修复的两个最明确租户私有模型（Department/Message）验证：
 * 1) 模型已声明 tenantId 属性；
 * 2) 在租户上下文下，beforeFind 钩子的注入判断 now 会对它们施加 { tenantId } 约束；
 * 3) 全局模型（Menu）仍不注入，保持全局语义；平台超管(bypass) 不注入。
 *
 * 说明：下面 simulateBeforeFind 逐行复刻 sequelizeTenantScope.ts 的 beforeFind 钩子逻辑，
 * 用于在单元测试中确定性地验证"模型是否会被注入约束"，无需连接真实数据库。
 */

function simulateBeforeFind(options: any, Model: any) {
  const ctx = getTenantContext()
  if (!ctx) return
  if (ctx.bypass) return
  if (!Model?.rawAttributes?.tenantId) return
  const constraint = { tenantId: ctx.tenantId ?? -1 }
  options.where = options.where ? { [Op.and]: [options.where, constraint] } : constraint
}

function expectWhereHasTenant(where: any, tenantId: number) {
  expect(where[Op.and]).toBeInstanceOf(Array)
  const tenantConstraint = where[Op.and].find(
    (w: any) => w && Object.prototype.hasOwnProperty.call(w, 'tenantId'),
  )
  expect(tenantConstraint).toBeDefined()
  expect(tenantConstraint.tenantId).toBe(tenantId)
}

describe('P0: 租户隔离模型 tenantId 属性缺失修复', () => {
  it('Department 模型已声明 tenantId 属性（修复点）', () => {
    expect(Department.rawAttributes.tenantId).toBeDefined()
  })

  it('Message 模型已声明 tenantId 属性（修复点）', () => {
    expect(Message.rawAttributes.tenantId).toBeDefined()
  })

  it('全局 Menu 模型仍不声明 tenantId（架构：全局资源保持全局）', () => {
    expect(Menu.rawAttributes.tenantId).toBeUndefined()
  })

  it('租户上下文下 Department 查询被注入 tenantId 约束', async () => {
    await runInTenant({ tenantId: 2, userId: 1 }, async () => {
      const options: any = { where: { status: 1 } }
      simulateBeforeFind(options, Department)
      expectWhereHasTenant(options.where, 2)
    })
  })

  it('租户上下文下 Message 查询被注入 tenantId 约束', async () => {
    await runInTenant({ tenantId: 7, userId: 1 }, async () => {
      const options: any = { where: { toUserId: 1 } }
      simulateBeforeFind(options, Message)
      expectWhereHasTenant(options.where, 7)
    })
  })

  it('bypass（平台超管）不注入约束，可见全部租户', async () => {
    await runInTenant({ tenantId: 2, bypass: true }, async () => {
      const options: any = { where: { status: 1 } }
      simulateBeforeFind(options, Department)
      expect(options.where).toEqual({ status: 1 })
    })
  })

  it('全局 Menu 不注入约束（保持全局可见）', async () => {
    await runInTenant({ tenantId: 2, userId: 1 }, async () => {
      const options: any = { where: { status: 1 } }
      simulateBeforeFind(options, Menu)
      expect(options.where).toEqual({ status: 1 })
    })
  })
})
