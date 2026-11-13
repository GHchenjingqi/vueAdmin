import { describe, it, expect } from 'vitest'
import { Op } from 'sequelize'
import Department from '../models/Department.js'
import Message from '../models/Message.js'
import Menu from '../models/Menu.js'
import Role from '../models/Role.js'
import Log from '../models/Log.js'
import Setting from '../models/Setting.js'
import Notice from '../models/Notice.js'
import NoticeRead from '../models/NoticeRead.js'
import Task from '../models/Task.js'
import RefreshToken from '../models/RefreshToken.js'
import AiProvider from '../models/AiProvider.js'
import DictType from '../models/DictType.js'
import DictData from '../models/DictData.js'
import WorkflowVersion from '../models/WorkflowVersion.js'
import WorkflowNode from '../models/WorkflowNode.js'
import WorkflowEdge from '../models/WorkflowEdge.js'
import WorkflowApproverRule from '../models/WorkflowApproverRule.js'
import WorkflowBinding from '../models/WorkflowBinding.js'
import WorkflowInstanceLog from '../models/WorkflowInstanceLog.js'
import { runInTenant, getTenantContext } from '../modules/tenant/context.js'

/**
 * 背景（P0 根因）：
 * 迁移 20260901_000003 给 25 张业务表加了 tenant_id 列（设计意图全面租户隔离），
 * 但最初只有 6 个模型映射了 tenantId 属性。Sequelize 全局 beforeFind 钩子
 * （sequelizeTenantScope.ts）用 `if (!Model?.rawAttributes?.tenantId) return` 判断 ——
 * 未映射属性的模型，其所有查询完全不受租户约束，造成跨租户数据泄漏，且 beforeCreate
 * 也不会写入 tenantId。
 *
 * 本轮已将全部"租户私有"模型补上 tenantId 属性（Department/Message/Notice/NoticeRead/
 * Task/RefreshToken/AiProvider/DictType/DictData/Workflow* 子表）。本测试验证：
 * 1) 这些模型已声明 tenantId 属性；
 * 2) 租户上下文下，beforeFind 钩子的注入判断 now 会对它们施加 { tenantId } 约束；
 * 3) 刻意保留为全局的资源（Role/Menu/Log/Setting）仍不注入，保持全局语义；
 * 4) 平台超管(bypass) 不注入，可见全部租户。
 *
 * 说明：simulateBeforeFind 逐行复刻 sequelizeTenantScope.ts 的 beforeFind 钩子逻辑，
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

// 全部应已映射 tenantId 的租户私有模型
const tenantScopedModels: Record<string, any> = {
  Department,
  Message,
  Notice,
  NoticeRead,
  Task,
  RefreshToken,
  AiProvider,
  DictType,
  DictData,
  WorkflowVersion,
  WorkflowNode,
  WorkflowEdge,
  WorkflowApproverRule,
  WorkflowBinding,
  WorkflowInstanceLog,
}

// 刻意保留为全局的资源（不加 tenantId）
const globalModels: Record<string, any> = {
  Role,
  Menu,
  Log,
  Setting,
}

describe('P0: 租户隔离模型 tenantId 属性缺失修复', () => {
  for (const [name, Model] of Object.entries(tenantScopedModels)) {
    it(`${name} 模型已声明 tenantId 属性（修复点）`, () => {
      expect(Model.rawAttributes.tenantId).toBeDefined()
    })
  }

  for (const [name, Model] of Object.entries(globalModels)) {
    it(`全局 ${name} 模型仍不声明 tenantId（架构：全局资源保持全局）`, () => {
      expect(Model.rawAttributes.tenantId).toBeUndefined()
    })
  }

  it('租户上下文下 Department 查询被注入 tenantId 约束', async () => {
    await runInTenant({ tenantId: 2, userId: 1 }, async () => {
      const options: any = { where: { status: 1 } }
      simulateBeforeFind(options, Department)
      expectWhereHasTenant(options.where, 2)
    })
  })

  it('租户上下文下 Notice 查询被注入 tenantId 约束', async () => {
    await runInTenant({ tenantId: 3, userId: 1 }, async () => {
      const options: any = { where: { status: 'published' } }
      simulateBeforeFind(options, Notice)
      expectWhereHasTenant(options.where, 3)
    })
  })

  it('租户上下文下 WorkflowNode 查询被注入 tenantId 约束', async () => {
    await runInTenant({ tenantId: 5, userId: 1 }, async () => {
      const options: any = { where: { workflowId: 10 } }
      simulateBeforeFind(options, WorkflowNode)
      expectWhereHasTenant(options.where, 5)
    })
  })

  it('租户上下文下 RefreshToken 查询被注入 tenantId 约束', async () => {
    await runInTenant({ tenantId: 9, userId: 1 }, async () => {
      const options: any = { where: { userId: 1, purpose: 'auth' } }
      simulateBeforeFind(options, RefreshToken)
      expectWhereHasTenant(options.where, 9)
    })
  })

  it('bypass（平台超管）不注入约束，可见全部租户', async () => {
    await runInTenant({ tenantId: 2, bypass: true }, async () => {
      const options: any = { where: { status: 1 } }
      simulateBeforeFind(options, Notice)
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
