// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { Request, Response } from 'express'
import { runInTenant } from '../modules/tenant/context.js'
import { AuditLog } from '../modules/shop/models/index.js'
import * as auditLogService from '../modules/shop/services/auditLogService.js'
import * as controller from '../modules/shop/controllers/auditLogController.js'

const TID = 89
const ENTITY_ID = 89001
const ACTIONS = ['article.created', 'article.published', 'article.updated', 'article.unpublished']
const DATES = ['2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z']

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    await AuditLog.destroy({ where: { tenantId: TID, entityType: 'article' } })
    for (let i = 0; i < ACTIONS.length; i += 1) {
      await AuditLog.create({
        tenantId: TID,
        actorType: 'admin',
        action: ACTIONS[i],
        entityType: 'article',
        entityId: ENTITY_ID,
        beforeState: null,
        afterState: { step: i },
        createdAt: new Date(DATES[i]),
      } as never)
    }
  })
})

afterAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    await AuditLog.destroy({ where: { tenantId: TID, entityType: 'article' } })
  })
})

describe('X-T03 审计查询增强：action / 时间范围 / 分页', () => {
  it('默认按 id 倒序，limit 钳制在 1..500', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const all = await auditLogService.listByEntity({ entityType: 'article', entityId: ENTITY_ID })
      expect(all).toHaveLength(4)
      const ids = all.map((r) => r.id)
      expect(ids).toEqual([...ids].sort((a, b) => b - a))
      expect(await auditLogService.listByEntity({ entityType: 'article', limit: 9999 })).toHaveLength(4)
      expect(await auditLogService.listByEntity({ entityType: 'article', limit: -1 })).toHaveLength(1)
    })
  })

  it('action 精确过滤', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const rows = await auditLogService.listByEntity({ entityType: 'article', action: 'article.published' })
      expect(rows).toHaveLength(1)
      expect(rows[0].action).toBe('article.published')
      expect(await auditLogService.listByEntity({ entityType: 'article', action: 'article.nope' })).toEqual([])
    })
  })

  it('from/to 时间范围含边界', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const rows = await auditLogService.listByEntity({
        entityType: 'article',
        from: new Date('2026-02-01T00:00:00Z'),
        to: new Date('2026-03-01T00:00:00Z'),
      })
      expect(rows.map((r) => r.action).sort()).toEqual(['article.published', 'article.updated'])
      const onlyFrom = await auditLogService.listByEntity({
        entityType: 'article',
        from: new Date('2026-04-01T00:00:00Z'),
      })
      expect(onlyFrom.map((r) => r.action)).toEqual(['article.unpublished'])
    })
  })

  it('limit/offset 分页不重不漏', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const p1 = await auditLogService.listByEntity({ entityType: 'article', limit: 2, offset: 0 })
      const p2 = await auditLogService.listByEntity({ entityType: 'article', limit: 2, offset: 2 })
      expect(p1).toHaveLength(2)
      expect(p2).toHaveLength(2)
      expect(new Set([...p1, ...p2].map((r) => r.id)).size).toBe(4)
    })
  })

  it('跨租户查不到审计记录', async () => {
    await runInTenant({ tenantId: TID + 1 }, async () => {
      expect(await auditLogService.listByEntity({ entityType: 'article' })).toEqual([])
    })
  })
})

describe('X-T03 审计查询端点参数校验', () => {
  function mockReqRes(query: Record<string, unknown> = {}) {
    const raw = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    return {
      req: { query } as unknown as Request,
      res: raw as unknown as Response,
      raw,
      next: vi.fn(),
    }
  }

  it('缺 entityType / 非法日期返回 400', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const missing = mockReqRes({})
      await controller.listAuditLogs(missing.req, missing.res, missing.next)
      expect(missing.raw.status).toHaveBeenCalledWith(400)

      const badDate = mockReqRes({ entityType: 'article', from: 'not-a-date' })
      await controller.listAuditLogs(badDate.req, badDate.res, badDate.next)
      expect(badDate.raw.status).toHaveBeenCalledWith(400)
    })
  })

  it('合法过滤参数透传并只返回目标 action', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const ok = mockReqRes({ entityType: 'article', action: 'article.published', limit: '10' })
      await controller.listAuditLogs(ok.req, ok.res, ok.next)
      expect(ok.next).not.toHaveBeenCalled()
      expect(ok.raw.json).toHaveBeenCalledWith({ code: 0, data: expect.any(Array) })
      const rows = ok.raw.json.mock.calls[0][0].data as Array<{ action: string }>
      expect(rows).toHaveLength(1)
      expect(rows[0].action).toBe('article.published')
    })
  })
})
