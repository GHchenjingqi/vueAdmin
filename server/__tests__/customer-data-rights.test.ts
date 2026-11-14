// @vitest-environment node
/**
 * 顾客数据权利（PLAN 5.3）
 *
 * 缺口：C 端只有注册/登录/me，没有注销与数据导出。GDPR 的被遗忘权与可携带权、
 * CCPA 的删除权都要求提供这两项。
 *
 * 本测试锁定四条约束：
 * 1. 注销后原邮箱不可再登录、原密码不可再核验（账号已停用）；
 * 2. 注销是「匿名化」而非物理删除：订单仍存在（财务凭证），但顾客邮箱被替换；
 * 3. 地址/收藏等直接标识被清除；
 * 4. 导出只含该顾客本人数据，且不包含其它顾客的记录。
 *
 * 独立租户 987795，真实 MySQL。
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { Op } from 'sequelize'
import { runInTenant } from '../modules/tenant/context.js'
import {
  ShopCustomer,
  ShopCustomerAddress,
  ShopOrder,
  ShopWishlist,
  ShopChannel,
  ShopShop,
  ShopNewsletter,
  ShopRestockSubscription,
} from '../modules/shop/models/index.js'
import * as customerService from '../modules/shop/services/customerService.js'
import * as customerDataService from '../modules/storefront/services/customerDataService.js'

const TID = 987795
const RUN = Date.now().toString(36)
const PREFIX = `gdpr-${RUN}@`
let seq = 0
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const nextEmail = (): string => `${PREFIX}${++seq}@t.local`

async function register(): Promise<{ id: number; email: string }> {
  const email = nextEmail()
  const res = await customerService.registerCustomer({ tenantId: TID, email, password: 'Passw0rd!23', nickname: 'Tester' })
  return { id: res.customer.id, email }
}

let channelId = 0
let shopId = 0

async function seedOrder(customerId: number, email: string): Promise<number> {
  if (!channelId) {
    const ch = await ShopChannel.create({ name: `GD Ch ${RUN}`, type: 'independent', tenantId: TID } as never)
    channelId = ch.id
    const sh = await ShopShop.create({ name: `GD Shop ${RUN}`, channelId, tenantId: TID } as never)
    shopId = sh.id
  }
  const order = await ShopOrder.create({
    orderNo: `GD${Date.now()}${seq}`,
    channelId,
    shopId,
    buyer: { email, customerId },
    currency: 'USD',
    amount: 99.9,
    amountCents: 9990,
    subtotalCents: 9990,
    status: 'paid',
    paymentStatus: 'captured',
    email,
    tenantId: TID,
  } as never)
  return order.id
}

beforeEach(async () => {
  await ShopCustomerAddress.destroy({ where: { tenantId: TID } })
  await ShopWishlist.destroy({ where: { tenantId: TID } })
  await ShopOrder.destroy({ where: { tenantId: TID } })
  await ShopNewsletter.destroy({ where: { tenantId: TID } })
  await ShopRestockSubscription.destroy({ where: { tenantId: TID } })
  await ShopCustomer.destroy({ where: { tenantId: TID } })
})

afterAll(async () => {
  await ShopCustomerAddress.destroy({ where: { tenantId: TID } })
  await ShopWishlist.destroy({ where: { tenantId: TID } })
  await ShopOrder.destroy({ where: { tenantId: TID } })
  await ShopNewsletter.destroy({ where: { tenantId: TID } })
  await ShopRestockSubscription.destroy({ where: { tenantId: TID } })
  await ShopCustomer.destroy({ where: { tenantId: TID } })
  await ShopShop.destroy({ where: { tenantId: TID } })
  await ShopChannel.destroy({ where: { tenantId: TID } })
})

describe('deleteAccount', () => {
  it('anonymizes the account so the original email can no longer sign in', async () => {
    await inTenant(async () => {
      const { id, email } = await register()
      await customerDataService.deleteAccount(id)

      const row = await ShopCustomer.findByPk(id)
      expect(row?.status).toBe('deleted')
      expect(row?.email).not.toBe(email)
      expect(row?.email).toMatch(/@deleted\.invalid$/)
      expect(row?.nickname).toBeNull()

      // 原邮箱已不存在 → 登录报"邮箱或密码错误"（不再是有效凭据）
      await expect(
        customerService.authenticateCustomer({ tenantId: TID, email, password: 'Passw0rd!23', ip: '127.0.0.1' }),
      ).rejects.toThrow()
    })
  }, 60_000)

  it('rejects the old password after deletion', async () => {
    await inTenant(async () => {
      const { id } = await register()
      expect(await customerService.verifyCustomerPassword(TID, id, 'Passw0rd!23')).toBe(true)
      await customerDataService.deleteAccount(id)
      expect(await customerService.verifyCustomerPassword(TID, id, 'Passw0rd!23')).toBe(false)
    })
  }, 60_000)

  it('keeps orders for accounting but removes direct identifiers', async () => {
    await inTenant(async () => {
      const { id, email } = await register()
      const orderId = await seedOrder(id, email)
      await ShopCustomerAddress.create({
        tenantId: TID,
        customerId: id,
        fullName: 'Tester',
        phone: '123',
        country: 'US',
        province: 'CA',
        city: 'LA',
        address1: '1 Main St',
        postcode: '90001',
        isDefault: true,
      } as never)
      await ShopWishlist.create({ tenantId: TID, customerId: id, productId: 1, notifyOnSale: true } as never)

      await customerDataService.deleteAccount(id)

      // 订单保留（财务凭证），但顾客标识已匿名化
      expect(await ShopOrder.count({ where: { tenantId: TID, id: orderId } })).toBe(1)
      // 直接标识被清除
      expect(await ShopCustomerAddress.count({ where: { tenantId: TID, customerId: id } })).toBe(0)
      expect(await ShopWishlist.count({ where: { tenantId: TID, customerId: id } })).toBe(0)
    })
  }, 60_000)

  it('is not repeatable (second call reports the account no longer exists)', async () => {
    await inTenant(async () => {
      const { id } = await register()
      await customerDataService.deleteAccount(id)
      await expect(customerDataService.deleteAccount(id)).rejects.toThrow(/账号不存在/)
    })
  }, 60_000)

  it('removes email-linked marketing subscriptions (right to erasure)', async () => {
    await inTenant(async () => {
      const { id, email } = await register()
      // 按邮箱建立营销订阅：newsletter + 到货提醒，均与顾客邮箱关联
      await ShopNewsletter.create({
        tenantId: TID,
        email,
        status: 'subscribed',
        source: 'checkout',
        token: 'n' + 'a'.repeat(63),
      } as never)
      await ShopRestockSubscription.create({
        tenantId: TID,
        email,
        skuId: 1,
        spuId: 1,
        status: 'waiting',
        token: 'r' + 'b'.repeat(63),
      } as never)
      expect(await ShopNewsletter.count({ where: { tenantId: TID, email } })).toBe(1)
      expect(await ShopRestockSubscription.count({ where: { tenantId: TID, email } })).toBe(1)

      await customerDataService.deleteAccount(id)

      // 注销后营销订阅随原邮箱一并清除：匿名化后邮箱已不可匹配，且被遗忘权应撤回营销同意
      expect(await ShopNewsletter.count({ where: { tenantId: TID, email } })).toBe(0)
      expect(await ShopRestockSubscription.count({ where: { tenantId: TID, email } })).toBe(0)
      // 不误删其它顾客的订阅（按邮箱精确匹配）
      const other = nextEmail()
      await ShopNewsletter.create({
        tenantId: TID,
        email: other,
        status: 'subscribed',
        token: 'n' + 'c'.repeat(63),
      } as never)
      expect(await ShopNewsletter.count({ where: { tenantId: TID, email: other } })).toBe(1)
    })
  }, 60_000)
})

describe('exportCustomerData', () => {
  it('exports only the requesting customer records', async () => {
    await inTenant(async () => {
      const a = await register()
      const b = await register()
      await seedOrder(a.id, a.email)
      await seedOrder(b.id, b.email)

      const data = await customerDataService.exportCustomerData(a.id)
      expect(data.profile.id).toBe(a.id)
      expect(data.profile.email).toBe(a.email)
      expect(data.orders).toHaveLength(1)
      // 不得包含另一位顾客的订单
      const bOrders = await ShopOrder.findAll({ where: { tenantId: TID } })
      const bOrderNos = bOrders
        .filter((o) => Number((o.buyer as Record<string, unknown>)?.customerId) === b.id)
        .map((o) => o.orderNo)
      for (const no of bOrderNos) {
        expect(data.orders.map((o) => o.orderNo)).not.toContain(no)
      }
    })
  }, 60_000)

  it('includes addresses and never exposes password hashes', async () => {
    await inTenant(async () => {
      const { id } = await register()
      await ShopCustomerAddress.create({
        tenantId: TID,
        customerId: id,
        fullName: 'Tester',
        phone: '123',
        country: 'US',
        province: 'CA',
        city: 'LA',
        address1: '1 Main St',
        postcode: '90001',
        isDefault: true,
      } as never)

      const data = await customerDataService.exportCustomerData(id)
      expect(data.addresses).toHaveLength(1)
      expect(data.addresses[0].city).toBe('LA')
      // 导出体绝不能带密码哈希
      expect(JSON.stringify(data)).not.toMatch(/passwordHash|\$2[aby]\$/)
    })
  }, 60_000)
})
