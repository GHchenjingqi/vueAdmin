import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * 营销邮件服务测试（mock 模型层）：
 * - 受众解析：all_customers / tier / all_users / emails（去重）
 * - createCampaign：任务 + 收件人幂等（findOrCreate）
 * - sendCampaign：逐封投递、状态回写、SMTP 未配置保持 pending
 * - renderBody：变量替换
 */

const hoist = vi.hoisted(() => {
  const customers = [
    { id: 1, email: 'a@x.io', nickname: 'A', points: 10, status: 'active' },
    { id: 2, email: 'b@x.io', nickname: 'B', points: 20, status: 'active' },
    { id: 3, email: 'c@x.io', nickname: 'C', points: 30, status: 'blocked' },
  ]
  const users = [
    { id: 9, email: 'admin@x.io', nickname: 'Admin', status: 1 },
  ]
  const campaigns: Record<string, unknown>[] = []
  const recipients: Record<string, unknown>[] = []
  const sent: { to: string; subject: string }[] = []
  return { customers, users, campaigns, recipients, sent }
})

vi.mock('../models/User.js', () => ({
  default: {
    findAll: vi.fn(async (args: { where: Record<string, unknown> }) => hoist.users.filter((u) => u.status === args.where.status)),
    findOne: vi.fn(async (args: { where: { id?: number } }) => hoist.users.find((u) => u.id === args.where.id) ?? null),
    count: vi.fn(async () => 1),
  },
}))

vi.mock('../modules/shop/models/index.js', () => ({
  ShopCustomer: {
    findAll: vi.fn(async (args: { where: Record<string, unknown> }) =>
      hoist.customers.filter((c) => (args.where.membershipTierId ? c.id === args.where.membershipTierId : c.status === args.where.status))),
    findOne: vi.fn(async (args: { where: { id?: number } }) => hoist.customers.find((c) => c.id === args.where.id) ?? null),
    count: vi.fn(async () => 2),
  },
  User: {
    findAll: vi.fn(async (args: { where: Record<string, unknown> }) => hoist.users.filter((u) => u.status === args.where.status)),
    findOne: vi.fn(async (args: { where: { id?: number } }) => hoist.users.find((u) => u.id === args.where.id) ?? null),
    count: vi.fn(async () => 1),
  },
  ShopMembershipTier: {
    findAll: vi.fn(async () => [{ id: 1, name: '普通会员' }, { id: 2, name: '白银会员' }]),
    findOne: vi.fn(async (args: { where: { id?: number } }) => ({ id: args.where.id, name: '白银会员' })),
  },
  ShopMailCampaign: {
    create: vi.fn(async (rec: Record<string, unknown>) => {
      const row = { id: hoist.campaigns.length + 1, ...rec, update: vi.fn(async function (this: Record<string, unknown>, patch: Record<string, unknown>) { Object.assign(this, patch) }) }
      hoist.campaigns.push(row)
      return row
    }),
    findOne: vi.fn(async (args: { where: { id?: number } }) => hoist.campaigns.find((c) => c.id === args.where.id) ?? null),
    findAndCountAll: vi.fn(),
  },
  ShopMailCampaignRecipient: {
    findOrCreate: vi.fn(async (args: { where: { email: string }; defaults: Record<string, unknown> }) => {
      const exist = hoist.recipients.find((r) => r.email === args.where.email)
      if (exist) return [exist, false]
      const row = { id: hoist.recipients.length + 1, ...args.defaults, update: vi.fn(async function (this: Record<string, unknown>, patch: Record<string, unknown>) { Object.assign(this, patch) }) }
      hoist.recipients.push(row)
      return [row, true]
    }),
    findAll: vi.fn(async (args: { where: { status?: string } }) => hoist.recipients.filter((r) => (args.where.status ? r.status === args.where.status : true))),
    findAndCountAll: vi.fn(),
  },
}))

vi.mock('../utils/mailer.js', () => ({
  getTransporter: vi.fn(async () => ({
    sendMail: vi.fn(async (opts: { to: string; subject: string }) => { hoist.sent.push({ to: opts.to, subject: opts.subject }) }),
  })),
  getSenderName: vi.fn(async () => 'Aurora'),
}))

vi.mock('../../tenant/context.js', () => ({ getTenantContext: vi.fn(() => ({ tenantId: 1 })) }))

vi.mock('../middleware/errorHandler.js', () => ({
  AppError: class AppError extends Error {
    constructor(public status: number, message: string) { super(message) }
  },
}))

import * as mailCampaignService from '../modules/shop/services/mailCampaignService.js'

describe('mailCampaignService（营销邮件）', () => {
  beforeEach(() => {
    hoist.campaigns.length = 0
    hoist.recipients.length = 0
    hoist.sent.length = 0
  })

  it('resolveAudience：all_customers 只含 active 顾客', async () => {
    const out = await mailCampaignService.resolveAudience(1, { audienceType: 'all_customers' })
    expect(out.map((r) => r.email).sort()).toEqual(['a@x.io', 'b@x.io'])
  })

  it('resolveAudience：all_users 含后台用户', async () => {
    const out = await mailCampaignService.resolveAudience(1, { audienceType: 'all_users' })
    expect(out.map((r) => r.email)).toEqual(['admin@x.io'])
    expect(out[0].recipientType).toBe('user')
  })

  it('resolveAudience：emails 去重', async () => {
    const out = await mailCampaignService.resolveAudience(1, { audienceType: 'emails', audienceParam: 'x@y.io, x@y.io ,z@y.io' })
    expect(out.map((r) => r.email)).toEqual(['x@y.io', 'z@y.io'])
  })

  it('resolveAudience：tier 缺参数报 400', async () => {
    await expect(mailCampaignService.resolveAudience(1, { audienceType: 'tier' })).rejects.toMatchObject({ status: 400 })
  })

  it('createCampaign：任务 + 收件人幂等写入', async () => {
    const { campaign, recipientCount } = await mailCampaignService.createCampaign(
      1,
      { subject: 'Hello', body: 'Hi {{nickname}}', audienceType: 'all_customers' },
      1,
    )
    expect(recipientCount).toBe(2)
    expect(campaign.status).toBe('pending')
    expect(hoist.recipients).toHaveLength(2)
    // 重复创建收件人不重复（findOrCreate 幂等）
    await mailCampaignService.createCampaign(1, { subject: 'Hello2', body: 'x', audienceType: 'emails', audienceParam: 'a@x.io' }, 1)
    expect(hoist.recipients.some((r) => r.email === 'a@x.io')).toBe(true)
  })

  it('sendCampaign：逐封投递 + 状态回写', async () => {
    await mailCampaignService.createCampaign(1, { subject: 'Promo', body: 'Hi {{nickname}}', audienceType: 'all_customers' }, 1)
    const result = await mailCampaignService.sendCampaign(1, 1)
    expect(result.sent).toBe(2)
    expect(hoist.sent).toHaveLength(2)
    expect(hoist.recipients.every((r) => r.status === 'sent')).toBe(true)
  })

  it('sendCampaign：任务不存在报 404', async () => {
    await expect(mailCampaignService.sendCampaign(1, 999)).rejects.toMatchObject({ status: 404 })
  })

  it('renderBody：变量替换', () => {
    expect(mailCampaignService.renderBody('Hi {{nickname}}, points={{points}}, tier={{tier}}', { nickname: 'Tom', points: 42, tier: '黄金' })).toBe(
      'Hi Tom, points=42, tier=黄金',
    )
  })
})
