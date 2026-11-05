// @vitest-environment node
/**
 * P4-T02 地址簿 / 门禁 T-10 越权隔离实证
 *
 * 断言：首条自动默认；默认唯一；删除默认有兜底；取消默认有兜底；
 *       他人 / 跨租户不能读写删改（一律 404）；schema 剥离归属字段；
 *       并发设默认不产生双默认。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import * as customerService from '../modules/shop/services/customerService.js'
import * as addressService from '../modules/storefront/services/addressService.js'
import type { AddressOwner } from '../modules/storefront/services/addressService.js'
import { createAddressSchema, updateAddressSchema } from '../shared/schemas/customer.js'

const uniq = (): string => `ad${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(tenantId: number, fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId }, fn)

function payload(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    fullName: 'Alice',
    phone: '+1 555 0100',
    country: 'us',
    province: 'CA',
    city: 'Los Angeles',
    address1: '1 Main St',
    postcode: '90001',
    ...over,
  }
}

function create(over: Partial<Record<string, unknown>> = {}) {
  return createAddressSchema.parse(payload(over))
}

let ownerA: AddressOwner
let ownerB: AddressOwner
let crossTenant: AddressOwner

/** 每个用例都用全新顾客，避免用例间地址互相污染 */
beforeEach(async () => {
  const tag = uniq()
  await inTenant(1, async () => {
    const a = await customerService.registerCustomer({ tenantId: 1, email: `a-${tag}@example.com`, password: 'password123' })
    const b = await customerService.registerCustomer({ tenantId: 1, email: `b-${tag}@example.com`, password: 'password123' })
    ownerA = { tenantId: 1, customerId: a.customer.id }
    ownerB = { tenantId: 1, customerId: b.customer.id }
  })
  await inTenant(2, async () => {
    const c = await customerService.registerCustomer({ tenantId: 2, email: `c-${tag}@example.com`, password: 'password123' })
    crossTenant = { tenantId: 2, customerId: c.customer.id }
  })
})

const defaultsOf = async (owner: AddressOwner): Promise<number[]> =>
  (await addressService.listAddresses(owner)).filter((a) => a.isDefault).map((a) => a.id)

describe('P4-T02 地址簿默认地址规则', () => {
  it('首条地址自动成为默认，国家码归一化大写', async () => {
    const made = await inTenant(1, () => addressService.createAddress(ownerA, create()))
    expect(made.isDefault).toBe(true)
    expect(made.country).toBe('US')
    expect(await inTenant(1, () => defaultsOf(ownerA))).toEqual([made.id])
  })

  it('新增时指定默认会挤掉旧默认，且默认地址排在列表首位', async () => {
    await inTenant(1, async () => {
      const first = await addressService.createAddress(ownerA, create())
      const second = await addressService.createAddress(ownerA, create({ address1: '2 Main St', isDefault: true }))
      expect(first.id).not.toBe(second.id)
      expect(await defaultsOf(ownerA)).toEqual([second.id])
      const list = await addressService.listAddresses(ownerA)
      expect(list[0].id).toBe(second.id)
      expect(list).toHaveLength(2)
    })
  })

  it('显式设默认后仍全局唯一', async () => {
    await inTenant(1, async () => {
      const first = await addressService.createAddress(ownerA, create())
      await addressService.createAddress(ownerA, create({ address1: '2 Main St' }))
      const third = await addressService.createAddress(ownerA, create({ address1: '3 Main St', isDefault: true }))
      const back = await addressService.setDefaultAddress(ownerA, first.id)
      expect(back.isDefault).toBe(true)
      expect(await defaultsOf(ownerA)).toEqual([first.id])
      expect(third.id).toBeGreaterThan(first.id)
    })
  })

  it('删除默认地址自动提升剩余一条；删空后重建仍自动默认', async () => {
    await inTenant(1, async () => {
      const first = await addressService.createAddress(ownerA, create())
      const second = await addressService.createAddress(ownerA, create({ address1: '2 Main St', isDefault: true }))
      const removed = await addressService.deleteAddress(ownerA, second.id)
      expect(removed.promotedId).toBe(first.id)
      expect(await defaultsOf(ownerA)).toEqual([first.id])

      await addressService.deleteAddress(ownerA, first.id)
      expect(await addressService.listAddresses(ownerA)).toHaveLength(0)
      const rebuilt = await addressService.createAddress(ownerA, create())
      expect(rebuilt.isDefault).toBe(true)
    })
  })

  it('取消默认地址自动兜底；仅剩一条时不允许出现零默认', async () => {
    await inTenant(1, async () => {
      const first = await addressService.createAddress(ownerA, create())
      const second = await addressService.createAddress(ownerA, create({ address1: '2 Main St', isDefault: true }))
      const updated = await addressService.updateAddress(ownerA, second.id, { isDefault: false })
      expect(updated.isDefault).toBe(false)
      expect(await defaultsOf(ownerA)).toEqual([first.id])

      await addressService.deleteAddress(ownerA, second.id)
      const sole = await addressService.updateAddress(ownerA, first.id, { isDefault: false })
      expect(sole.isDefault).toBe(true)
      expect(await defaultsOf(ownerA)).toEqual([first.id])
    })
  })

  it('编辑只作用于提交字段，不改变归属', async () => {
    await inTenant(1, async () => {
      const made = await addressService.createAddress(ownerA, create())
      const updated = await addressService.updateAddress(ownerA, made.id, { city: 'San Francisco' })
      expect(updated.city).toBe('San Francisco')
      expect(updated.address1).toBe('1 Main St')
      expect(updated.country).toBe('US')
      expect(await addressService.listAddresses(ownerB)).toHaveLength(0)
    })
  })

  it('并发新增两个默认地址，最终仍只有一个默认', async () => {
    await inTenant(1, async () => {
      await Promise.all([
        addressService.createAddress(ownerA, create({ address1: 'A St', isDefault: true })),
        addressService.createAddress(ownerA, create({ address1: 'B St', isDefault: true })),
      ])
      expect(await defaultsOf(ownerA)).toHaveLength(1)
      expect(await addressService.listAddresses(ownerA)).toHaveLength(2)
    })
  })
})

describe('门禁 T-10 地址越权隔离', () => {
  it('同租户其他顾客不能编辑 / 删除 / 设默认他人地址（一律 404，原数据不变）', async () => {
    await inTenant(1, async () => {
      const made = await addressService.createAddress(ownerA, create())
      await expect(addressService.updateAddress(ownerB, made.id, { city: 'Hacked' })).rejects.toMatchObject({ statusCode: 404 })
      await expect(addressService.deleteAddress(ownerB, made.id)).rejects.toMatchObject({ statusCode: 404 })
      await expect(addressService.setDefaultAddress(ownerB, made.id)).rejects.toMatchObject({ statusCode: 404 })
      expect(await addressService.listAddresses(ownerB)).toHaveLength(0)
      expect((await addressService.listAddresses(ownerA))[0].city).toBe('Los Angeles')
    })
  })

  it('跨租户顾客改不了他人地址（404）；伪造租户归属写操作直接 403', async () => {
    await inTenant(1, async () => {
      const made = await addressService.createAddress(ownerA, create())
      // 另一租户的真实顾客：能锁到自己的顾客行，但地址归属不匹配 → 404
      await expect(addressService.updateAddress(crossTenant, made.id, { city: 'Hacked' })).rejects.toMatchObject({ statusCode: 404 })
      await expect(addressService.deleteAddress(crossTenant, made.id)).rejects.toMatchObject({ statusCode: 404 })
      expect(await addressService.listAddresses(crossTenant)).toHaveLength(0)

      // 同一 customerId 换到另一租户：查不到任何地址；写时顾客行不存在 → 403 且不落库
      const forged: AddressOwner = { tenantId: 2, customerId: ownerA.customerId }
      expect(await addressService.listAddresses(forged)).toHaveLength(0)
      await expect(addressService.updateAddress(forged, made.id, { city: 'Hacked' })).rejects.toMatchObject({ statusCode: 403 })
      expect(await defaultsOf(ownerA)).toEqual([made.id])
      expect((await addressService.listAddresses(ownerA))[0].city).toBe('Los Angeles')
    })
  })

  it('不存在的地址 id 与伪造归属字段均无法越权', async () => {
    await inTenant(1, async () => {
      await expect(addressService.deleteAddress(ownerA, 99999999)).rejects.toMatchObject({ statusCode: 404 })
      const forged = createAddressSchema.parse(payload({ customerId: ownerB.customerId, tenantId: 2 }))
      expect((forged as Record<string, unknown>).customerId).toBeUndefined()
      expect((forged as Record<string, unknown>).tenantId).toBeUndefined()
      const made = await addressService.createAddress(ownerA, forged)
      expect(await addressService.listAddresses(ownerB)).toHaveLength(0)
      expect(made.id).toBeGreaterThan(0)
    })
  })
})

describe('地址输入校验', () => {
  it('国家码必须两位字母；空 patch 拒绝；必填项缺失拒绝', () => {
    expect(createAddressSchema.safeParse(payload({ country: 'USA' })).success).toBe(false)
    expect(createAddressSchema.safeParse(payload({ country: 'U1' })).success).toBe(false)
    expect(updateAddressSchema.safeParse({}).success).toBe(false)
    expect(createAddressSchema.safeParse({ ...payload(), address1: '' }).success).toBe(false)
  })
})
