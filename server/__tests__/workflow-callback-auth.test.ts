/**
 * PLAN 14：工作流审批回调签名 / 验签回归测试。
 *
 * 修复前端点无鉴权，任何能访问服务器的客户端都可匿名伪造审批回调绕过审批流上/下架商品。
 * 修复后引擎 HMAC 签名、端点 fail-closed 验签。本测试覆盖：
 *  - 合法签名通过、缺签名/错签名/过期时间戳一律拒绝（验签工具本身）；
 *  - 控制器缺签/错签 401 拒绝且不触碰 applyWorkflowResult；合法签名才执行状态变更。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'
import config from '../config/index.js'
import { signWorkflowCallback, verifyWorkflowCallback } from '../services/workflowCallbackAuth.js'

const SECRET = config.workflow?.callbackSecret || config.jwt.secret

// 控制器依赖 spuService.applyWorkflowResult（触及 DB），整库 mock 掉，只验证鉴权闸门
vi.mock('../modules/shop/services/spuService.js', () => ({
  applyWorkflowResult: vi.fn(async (_id: number, status: string) => ({ id: 1, status })),
}))

const { workflowCallback } = await import('../modules/shop/controllers/spuController.js')
const spuService = await import('../modules/shop/services/spuService.js')

function mockRes() {
  const res: any = {}
  res.json = vi.fn(() => res)
  res.status = vi.fn(() => res)
  return res
}

describe('verifyWorkflowCallback（验签工具）', () => {
  it('合法签名通过', () => {
    const payload = { instanceId: 42, status: 'approved' }
    const { signature, ts } = signWorkflowCallback(payload)
    expect(verifyWorkflowCallback(42, 'approved', signature, String(ts))).toBe(true)
  })

  it('缺签名拒绝', () => {
    expect(verifyWorkflowCallback(42, 'approved', undefined, undefined)).toBe(false)
  })

  it('错签名拒绝', () => {
    const { ts } = signWorkflowCallback({ instanceId: 42, status: 'approved' })
    expect(verifyWorkflowCallback(42, 'approved', 'deadbeef', String(ts))).toBe(false)
  })

  it('时间戳过期（未来 10 分钟，即便用真实密钥签名）拒绝', () => {
    const future = Date.now() + 10 * 60 * 1000
    const data = `42|approved|${future}`
    const signature = crypto.createHmac('sha256', SECRET).update(data).digest('hex')
    expect(verifyWorkflowCallback(42, 'approved', signature, String(future))).toBe(false)
  })

  it('篡改 instanceId 导致签名不符', () => {
    const { signature, ts } = signWorkflowCallback({ instanceId: 42, status: 'approved' })
    // 攻击者把 instanceId 改成 99，签名对不上
    expect(verifyWorkflowCallback(99, 'approved', signature, String(ts))).toBe(false)
  })
})

describe('workflowCallback 控制器（fail-closed）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('缺签名 → 401 且未触碰 applyWorkflowResult', async () => {
    const req: any = { body: { instanceId: 42, status: 'approved' }, headers: {} }
    const res = mockRes()
    const next = vi.fn()
    await workflowCallback(req, res, next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }))
    expect(spuService.applyWorkflowResult).not.toHaveBeenCalled()
    expect(res.json).not.toHaveBeenCalled()
  })

  it('错签名 → 401 且未触碰 applyWorkflowResult', async () => {
    const req: any = {
      body: { instanceId: 42, status: 'approved' },
      headers: { 'x-workflow-signature': 'bad', 'x-workflow-ts': String(Date.now()) },
    }
    const res = mockRes()
    const next = vi.fn()
    await workflowCallback(req, res, next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }))
    expect(spuService.applyWorkflowResult).not.toHaveBeenCalled()
  })

  it('合法签名 → 执行 applyWorkflowResult 并回写状态', async () => {
    const payload = { instanceId: 42, status: 'approved' }
    const { signature, ts } = signWorkflowCallback(payload)
    const req: any = {
      body: payload,
      headers: { 'x-workflow-signature': signature, 'x-workflow-ts': String(ts) },
    }
    const res = mockRes()
    const next = vi.fn()
    await workflowCallback(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(spuService.applyWorkflowResult).toHaveBeenCalledWith(42, 'approved')
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0 }))
  })

  it('任何状态缺签名 → 一律 401（整端点 HMAC 闸门，无论 status 取值）', async () => {
    const req: any = { body: { instanceId: 42, status: 'pending' }, headers: {} }
    const res = mockRes()
    const next = vi.fn()
    await workflowCallback(req, res, next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }))
    expect(spuService.applyWorkflowResult).not.toHaveBeenCalled()
    expect(res.json).not.toHaveBeenCalled()
  })
})
