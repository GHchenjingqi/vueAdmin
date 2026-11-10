// @vitest-environment node
/**
 * 支付凭据链路发现式审计实证（先跑红坐实缺陷，修复后转绿）：
 * - 解密失败（密钥轮换/密文损坏）必须 fail-closed，绝不静默回退 env 旧凭据；
 * - 并发首次保存同一通道不得触发唯一键冲突；
 * - 并发部分更新不得产生 lost-update；
 * - 后台改收款凭据必须留审计痕，且审计内容不得含明文。
 *
 * 依赖迁移 20261110_000076_create-payment-credentials 已应用到测试库（npm run migrate）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopPaymentCredential, AuditLog } from '../modules/shop/models/index.js'
import { resolveGatewayConfig, saveCredentials } from '../modules/storefront/payments/credentialService.js'
import { assertGatewayConfigured } from '../modules/storefront/payments/gatewayRegistry.js'
import { updateCredentials } from '../modules/shop/controllers/paymentChannelsController.js'

const TID = 555002
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

const ENV_KEYS = [
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'PAYPAL_ENV',
  'PAYPAL_WEBHOOK_ID',
  'PAYMENT_PUBLIC_BASE_URL',
  'JWT_SECRET',
  'PAYMENT_CREDENTIAL_SECRET',
]
let savedEnv: Record<string, string | undefined> = {}

beforeEach(async () => {
  savedEnv = {}
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  process.env.JWT_SECRET = 'test-credential-key'
  process.env.PAYMENT_PUBLIC_BASE_URL = 'https://shop.test'
  await inTenant(async () => {
    await ShopPaymentCredential.destroy({ where: { tenantId: TID } })
    await AuditLog.destroy({ where: { tenantId: TID, action: 'payment.credentials_updated' } })
  })
})

afterEach(async () => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k] as string
  }
  await inTenant(async () => {
    await ShopPaymentCredential.destroy({ where: { tenantId: TID } })
    await AuditLog.destroy({ where: { tenantId: TID, action: 'payment.credentials_updated' } })
  })
})

const PAYPAL_ALL = {
  CLIENT_ID: 'PROD_CID',
  CLIENT_SECRET: 'PROD_SECRET',
  ENV: 'live',
  WEBHOOK_ID: 'PROD_WH',
}

describe('缺陷一：解密失败静默回退 env（fail-open）', () => {
  it('DB 密文无法解密时 resolveGatewayConfig 抛专用错误，不得回退到 env 旧凭据', async () => {
    process.env.PAYMENT_CREDENTIAL_SECRET = 'key-A'
    await inTenant(async () => {
      await saveCredentials(TID, 'paypal', PAYPAL_ALL)
      // 模拟运维轮换/漏配加密密钥，同时 env 里残留旧沙箱凭据
      process.env.PAYMENT_CREDENTIAL_SECRET = 'key-B'
      process.env.PAYPAL_CLIENT_ID = 'SANDBOX_CID'
      process.env.PAYPAL_CLIENT_SECRET = 'SANDBOX_SECRET'
      process.env.PAYPAL_ENV = 'sandbox'
      process.env.PAYPAL_WEBHOOK_ID = 'SANDBOX_WH'

      await expect(resolveGatewayConfig('paypal')).rejects.toThrow(/PAYMENT_CREDENTIAL_DECRYPT_FAILED/)
    })
  })

  it('解密失败时 assertGatewayConfigured 同样 fail-closed（不得误判为已配置）', async () => {
    process.env.PAYMENT_CREDENTIAL_SECRET = 'key-A'
    await inTenant(async () => {
      await saveCredentials(TID, 'paypal', PAYPAL_ALL)
      process.env.PAYMENT_CREDENTIAL_SECRET = 'key-B'
      process.env.PAYPAL_CLIENT_ID = 'SANDBOX_CID'
      process.env.PAYPAL_CLIENT_SECRET = 'SANDBOX_SECRET'
      process.env.PAYPAL_ENV = 'sandbox'
      process.env.PAYPAL_WEBHOOK_ID = 'SANDBOX_WH'
      await expect(assertGatewayConfigured('paypal')).rejects.toThrow(/PAYMENT_CREDENTIAL_DECRYPT_FAILED/)
    })
  })
})

describe('缺陷二：并发保存非原子', () => {
  it('并发首次保存同一通道不抛唯一键冲突，且所有字段最终都在', async () => {
    await inTenant(async () => {
      const results = await Promise.all([
        saveCredentials(TID, 'paypal', { CLIENT_ID: 'CID' }),
        saveCredentials(TID, 'paypal', { CLIENT_SECRET: 'SECRET' }),
        saveCredentials(TID, 'paypal', { ENV: 'live' }),
        saveCredentials(TID, 'paypal', { WEBHOOK_ID: 'WH' }),
      ])
      expect(results).toHaveLength(4)
      const cfg = await resolveGatewayConfig('paypal')
      expect(cfg.CLIENT_ID).toBe('CID')
      expect(cfg.CLIENT_SECRET).toBe('SECRET')
      expect(cfg.ENV).toBe('live')
      expect(cfg.WEBHOOK_ID).toBe('WH')
    })
  })

  it('并发更新不同字段不产生 lost-update（两个改动都必须保留）', async () => {
    await inTenant(async () => {
      await saveCredentials(TID, 'paypal', PAYPAL_ALL)
      await Promise.all([
        saveCredentials(TID, 'paypal', { CLIENT_ID: 'NEW_CID' }),
        saveCredentials(TID, 'paypal', { ENV: 'sandbox' }),
      ])
      const cfg = await resolveGatewayConfig('paypal')
      expect(cfg.CLIENT_ID).toBe('NEW_CID')
      expect(cfg.ENV).toBe('sandbox')
      expect(cfg.CLIENT_SECRET).toBe('PROD_SECRET')
      expect(cfg.WEBHOOK_ID).toBe('PROD_WH')
    })
  })
})

describe('缺陷三：后台改收款凭据无审计留痕', () => {
  it('updateCredentials 写审计记录，且 before/after 均不含凭据明文', async () => {
    await inTenant(async () => {
      const req = {
        body: { provider: 'paypal', credentials: { CLIENT_SECRET: 'TOP_SECRET_VALUE' }, confirmImpact: true },
        user: { id: 7, username: 'admin' },
      } as unknown as Request
      const res = { json: vi.fn() } as unknown as Response
      const next = vi.fn() as unknown as NextFunction
      await updateCredentials(req, res, next)
      expect(next).not.toHaveBeenCalled()

      const row = await AuditLog.findOne({
        where: { tenantId: TID, action: 'payment.credentials_updated' },
        order: [['id', 'DESC']],
      })
      expect(row).not.toBeNull()
      const blob = JSON.stringify({ before: row!.beforeState, after: row!.afterState })
      expect(blob).not.toContain('TOP_SECRET_VALUE')
      expect(blob).toContain('CLIENT_SECRET')
    })
  })
})
