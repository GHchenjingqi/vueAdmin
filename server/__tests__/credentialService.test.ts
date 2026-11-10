// @vitest-environment node
/**
 * 支付凭据加密落库实证：DB 存储凭据为主、环境变量兜底；掩码不回显明文；
 * 空字符串字段保留原值；assertGatewayConfigured 在缺失时 fail-closed（503）。
 *
 * 依赖迁移 20261110_000076_create-payment-credentials 已应用到测试库（npm run migrate）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopPaymentCredential } from '../modules/shop/models/index.js'
import {
  resolveGatewayConfig,
  saveCredentials,
  maskCredentials,
  listCredentialProviders,
} from '../modules/storefront/payments/credentialService.js'
import { assertGatewayConfigured } from '../modules/storefront/payments/gatewayRegistry.js'

const TID = 555001
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
  await inTenant(async () => {
    await ShopPaymentCredential.destroy({ where: { tenantId: TID } })
  })
})

afterEach(async () => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k] as string
  }
  await inTenant(async () => {
    await ShopPaymentCredential.destroy({ where: { tenantId: TID } })
  })
})

describe('支付凭据加密落库（DB 主、env 兜底）', () => {
  it('resolveGatewayConfig 优先返回 DB 存储凭据，覆盖同名环境变量', async () => {
    process.env.PAYPAL_CLIENT_ID = 'ENV_CID'
    process.env.PAYPAL_CLIENT_SECRET = 'ENV_SECRET'
    process.env.PAYPAL_ENV = 'live'
    process.env.PAYPAL_WEBHOOK_ID = 'ENV_WH'
    await inTenant(async () => {
      await saveCredentials(TID, 'paypal', { CLIENT_ID: 'DB_CID', CLIENT_SECRET: 'DB_SECRET', ENV: 'sandbox', WEBHOOK_ID: 'DB_WH' })
      const cfg = await resolveGatewayConfig('paypal')
      expect(cfg.CLIENT_ID).toBe('DB_CID')
      expect(cfg.CLIENT_SECRET).toBe('DB_SECRET')
      expect(cfg.ENV).toBe('sandbox')
      expect(cfg.WEBHOOK_ID).toBe('DB_WH')
    })
  })

  it('无 DB 凭据时回退到环境变量', async () => {
    process.env.PAYPAL_CLIENT_ID = 'ENV_CID'
    process.env.PAYPAL_CLIENT_SECRET = 'ENV_SECRET'
    process.env.PAYPAL_ENV = 'sandbox'
    process.env.PAYPAL_WEBHOOK_ID = 'ENV_WH'
    await inTenant(async () => {
      const cfg = await resolveGatewayConfig('paypal')
      expect(cfg.CLIENT_ID).toBe('ENV_CID')
      expect(cfg.CLIENT_SECRET).toBe('ENV_SECRET')
      expect(cfg.ENV).toBe('sandbox')
      expect(cfg.WEBHOOK_ID).toBe('ENV_WH')
    })
  })

  it('maskCredentials 对 secret 仅回显末 4 位，非 secret 回显明文', async () => {
    await inTenant(async () => {
      await saveCredentials(TID, 'paypal', { CLIENT_ID: 'DB_CID', CLIENT_SECRET: 'DB_SECRET', ENV: 'sandbox', WEBHOOK_ID: 'DB_WH' })
      const fields = await maskCredentials(TID, 'paypal')
      const secret = fields.find((f) => f.key === 'CLIENT_SECRET')!
      const client = fields.find((f) => f.key === 'CLIENT_ID')!
      expect(secret.secret).toBe(true)
      expect(secret.present).toBe(true)
      expect(secret.value).toBe('****CRET')
      expect(client.secret).toBe(false)
      expect(client.value).toBe('DB_CID')
    })
  })

  it('saveCredentials 空字符串字段保留原值（不覆盖）', async () => {
    await inTenant(async () => {
      await saveCredentials(TID, 'paypal', { CLIENT_ID: 'DB_CID', CLIENT_SECRET: 'DB_SECRET', ENV: 'sandbox', WEBHOOK_ID: 'DB_WH' })
      const saved = await saveCredentials(TID, 'paypal', { ENV: 'live' }) // 只更新 ENV，secret 留空
      expect(saved.CLIENT_SECRET).toBe('DB_SECRET')
      expect(saved.CLIENT_ID).toBe('DB_CID')
      expect(saved.ENV).toBe('live')
      expect(saved.WEBHOOK_ID).toBe('DB_WH')
    })
  })

  it('listCredentialProviders 报告已配置状态', async () => {
    await inTenant(async () => {
      const before = (await listCredentialProviders(TID)).find((p) => p.id === 'paypal')!
      expect(before.configured).toBe(false)
      await saveCredentials(TID, 'paypal', { CLIENT_ID: 'DB_CID', CLIENT_SECRET: 'DB_SECRET', ENV: 'sandbox', WEBHOOK_ID: 'DB_WH' })
      const after = (await listCredentialProviders(TID)).find((p) => p.id === 'paypal')!
      expect(after.configured).toBe(true)
    })
  })
})

describe('凭据断言与 fail-closed', () => {
  it('凭据缺失时 assertGatewayConfigured 抛 503', async () => {
    await inTenant(async () => {
      await expect(assertGatewayConfigured('paypal')).rejects.toThrow(/PAYMENT_GATEWAY_NOT_CONFIGURED/)
    })
  })

  it('DB 凭据齐全时 assertGatewayConfigured 通过', async () => {
    process.env.PAYMENT_PUBLIC_BASE_URL = 'https://shop.test'
    await inTenant(async () => {
      await saveCredentials(TID, 'paypal', { CLIENT_ID: 'DB_CID', CLIENT_SECRET: 'DB_SECRET', ENV: 'sandbox', WEBHOOK_ID: 'DB_WH' })
      await expect(assertGatewayConfigured('paypal')).resolves.toBeUndefined()
    })
  })
})
