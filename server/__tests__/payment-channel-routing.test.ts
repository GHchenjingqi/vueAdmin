// @vitest-environment node
/**
 * 支付通道真实网关接入：按后台币种路由 + 后台勾选 + 银联全币种 + 各网关验签解析。
 *
 * 重点口径：
 * - 后台 settings 勾选才展示/可结算；未勾选的通道建会话 422、回调也不得改单；
 * - 银联 supportedCurrencies='*'，任何币种都展示；外币按订单快照原样送网关、不换汇；
 * - 真实网关缺凭据 fail-closed（503），绝不静默降级为 mock；
 * - 各网关通知验签机制互不相同，统一解析成 GatewayEvent 后复用既有幂等/CAS 底座。
 *
 * 配置用进程内 override 注入，不写全局 settings 表，避免污染并行测试。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'crypto'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopOrder } from '../modules/shop/models/index.js'
import { setChannelConfigOverride, validateEnabled } from '../modules/storefront/payments/channelConfig.js'
import { listProviders, isProviderUsable, getProvider, supportsCurrency, publicProvider } from '../modules/storefront/payments/providerRegistry.js'
import { assertGatewayConfigured } from '../modules/storefront/payments/gatewayRegistry.js'
import * as paymentService from '../modules/storefront/services/paymentService.js'
import { unionpayGateway } from '../modules/storefront/payments/gateways/unionpay.js'
import { alipayGateway } from '../modules/storefront/payments/gateways/alipay.js'
import { wechatGateway } from '../modules/storefront/payments/gateways/wechat.js'
import { paypalGateway } from '../modules/storefront/payments/gateways/paypal.js'
import { rsaSign, sortedKv } from '../modules/storefront/payments/gateways/common.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 987711
const uniq = (): string => `pg${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const site = { tenantId: TID, channelId: null, shopId: null, defaultCurrency: 'USD', defaultLocale: 'en-US' } as StorefrontSite

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString()

const ENV_KEYS = [
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'PAYPAL_ENV',
  'PAYPAL_WEBHOOK_ID',
  'WECHAT_MCH_ID',
  'WECHAT_APP_ID',
  'WECHAT_API_V3_KEY',
  'WECHAT_SERIAL_NO',
  'WECHAT_PRIVATE_KEY',
  'WECHAT_PLATFORM_PUBLIC_KEY',
  'ALIPAY_APP_ID',
  'ALIPAY_PRIVATE_KEY',
  'ALIPAY_PUBLIC_KEY',
  'ALIPAY_GATEWAY',
  'UNIONPAY_MER_ID',
  'UNIONPAY_CERT_ID',
  'UNIONPAY_PRIVATE_KEY',
  'UNIONPAY_PUBLIC_KEY',
  'UNIONPAY_GATEWAY',
  'UNIONPAY_FRONT_TRANS_URL',
  'UNIONPAY_BACK_TRANS_URL',
  'PAYMENT_PUBLIC_BASE_URL',
]
let savedEnv: Record<string, string | undefined> = {}

beforeEach(async () => {
  savedEnv = {}
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  setChannelConfigOverride(null)
  await inTenant(async () => {
    await ShopOrder.destroy({ where: { tenantId: TID } })
  })
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k] as string
  }
  setChannelConfigOverride(null)
  vi.unstubAllGlobals()
})

const enable = (...ids: string[]) => setChannelConfigOverride({ configured: true, enabled: ids, accounts: {} })

async function seedOrder(currency = 'USD') {
  return ShopOrder.create({
    orderNo: 'PG-' + uniq(),
    channelId: 0,
    shopId: 0,
    buyer: { name: 'gateway test' },
    currency,
    amountCents: 10000,
    amount: 100,
    status: 'created',
    email: 'pg@test.dev',
    tenantId: TID,
  } as never)
}

describe('按后台币种自动切换支付通道', () => {
  it('legacy 未配置：只暴露 mock/bnpl，真实通道默认不启用', async () => {
    expect((await listProviders('USD')).map((p) => p.id)).toEqual(['mock'])
  })

  it('USD：PayPal + 银联；CNY：微信 + 支付宝 + 银联', async () => {
    enable('paypal', 'wechat', 'alipay', 'unionpay')
    expect((await listProviders('USD')).map((p) => p.id)).toEqual(['paypal', 'unionpay'])
    expect((await listProviders('CNY')).map((p) => p.id)).toEqual(['wechat', 'alipay', 'unionpay'])
  })

  it('银联全币种：任何币种都展示，公开投影为 ["*"]', async () => {
    enable('unionpay')
    const unionpay = getProvider('unionpay')!
    expect(supportsCurrency(unionpay, 'USD')).toBe(true)
    expect(supportsCurrency(unionpay, 'CNY')).toBe(true)
    expect(supportsCurrency(unionpay, 'JPY')).toBe(true)
    for (const cur of ['USD', 'CNY', 'EUR', 'JPY']) {
      expect((await listProviders(cur)).map((p) => p.id)).toContain('unionpay')
      expect(await isProviderUsable(unionpay, cur)).toBe(true)
    }
    expect(publicProvider(unionpay).supportedCurrencies).toEqual(['*'])
  })

  it('未勾选的通道不显示、也不能结算；仅支持 CNY 的通道在 USD 下被过滤', async () => {
    enable('wechat')
    expect(await listProviders('USD')).toEqual([])
    expect(await listProviders('CNY')).toHaveLength(1)
    expect(await isProviderUsable(getProvider('paypal')!, 'USD')).toBe(false)
    expect(await isProviderUsable(getProvider('wechat')!, 'USD')).toBe(false)
    expect(await isProviderUsable(getProvider('wechat')!, 'CNY')).toBe(true)
  })

  it('后台开关对 mock 同样生效（配置后不再是 legacy 默认）', async () => {
    enable('paypal')
    expect((await listProviders('USD')).map((p) => p.id)).toEqual(['paypal'])
    expect(await isProviderUsable(getProvider('mock')!, 'USD')).toBe(false)
  })

  it('非法通道 id 写入被拒绝', () => {
    // PLAN 6.1 起 stripe 是合法通道，这里改用确实不存在的 id 验证白名单
    expect(() => validateEnabled(['paypal', 'not_a_real_channel'])).toThrow(/未知支付通道/)
  })
})

describe('真实网关 fail-closed 与不换汇', () => {
  it('勾选了 PayPal 但缺凭据：建会话 503，不落任何支付记录', async () => {
    enable('paypal')
    await inTenant(async () => {
      const order = await seedOrder()
      await expect(paymentService.createSession(site, order.id, 'paypal')).rejects.toThrow(/PAYMENT_GATEWAY_NOT_CONFIGURED/)
      await expect(assertGatewayConfigured('paypal')).rejects.toThrow(/PAYMENT_GATEWAY_NOT_CONFIGURED/)
    })
  })

  it('未勾选的真实通道建会话 422', async () => {
    enable('unionpay')
    await inTenant(async () => {
      const order = await seedOrder()
      await expect(paymentService.createSession(site, order.id, 'paypal')).rejects.toMatchObject({ statusCode: 422 })
    })
  })

  it('银联外币原样送网关：金额仍为订单快照分、currencyCode=840 且不做换算', async () => {
    process.env.UNIONPAY_MER_ID = 'M1'
    process.env.UNIONPAY_CERT_ID = 'C1'
    process.env.UNIONPAY_PRIVATE_KEY = PRIV
    process.env.UNIONPAY_PUBLIC_KEY = PUB
    process.env.UNIONPAY_GATEWAY = 'https://gateway.test'
    process.env.UNIONPAY_FRONT_TRANS_URL = 'https://gateway.test/front'
    process.env.UNIONPAY_BACK_TRANS_URL = 'https://gateway.test/back'
    process.env.PAYMENT_PUBLIC_BASE_URL = 'https://shop.test'
    const session = await unionpayGateway.createPayment({
      orderNo: 'SO-1',
      amountCents: 10000,
      currency: 'USD',
      providerRef: 'pay_SO1_x',
      gatewayOrderNo: 'PUSD123',
      notifyUrl: 'https://shop.test/notify',
      returnUrl: 'https://shop.test/return',
      subject: 'order',
      tenantId: TID,
    })
    expect(session.action).toBe('form')
    expect(session.form?.fields.txnAmt).toBe('10000')
    expect(session.form?.fields.currencyCode).toBe('840')
    expect(session.form?.fields.orderId).toBe('PUSD123')
  })
})

describe('各网关通知验签与统一事件解析', () => {
  it('银联：RSA 验签 + USD 通知解析回 USD，金额按分原样', async () => {
    process.env.UNIONPAY_MER_ID = 'M1'
    process.env.UNIONPAY_CERT_ID = 'C1'
    process.env.UNIONPAY_PRIVATE_KEY = PRIV
    process.env.UNIONPAY_PUBLIC_KEY = PUB
    process.env.UNIONPAY_GATEWAY = 'https://gateway.test'
    process.env.UNIONPAY_FRONT_TRANS_URL = 'https://gateway.test/front'
    process.env.UNIONPAY_BACK_TRANS_URL = 'https://gateway.test/back'
    const fields: Record<string, string> = {
      version: '5.1.0',
      encoding: 'UTF-8',
      signMethod: '01',
      merId: 'M1',
      orderId: 'PUSD123',
      txnAmt: '10000',
      currencyCode: '840',
      respCode: '00',
      queryId: 'Q1',
      txnType: '01',
    }
    fields.signature = rsaSign(PRIV, sortedKv(fields, ['signature']))
    const event = await unionpayGateway.verifyAndParse({ rawBody: Buffer.from(new URLSearchParams(fields).toString()), headers: {}, config: {} })
    expect(event.type).toBe('payment.succeeded')
    expect(event.gatewayOrderNo).toBe('PUSD123')
    expect(event.currency).toBe('USD')
    expect(event.amountCents).toBe(10000)

    const tampered = { ...fields, txnAmt: '99999' }
    await expect(unionpayGateway.verifyAndParse({ rawBody: Buffer.from(new URLSearchParams(tampered).toString()), headers: {}, config: {} })).rejects.toThrow(
      /签名无效/,
    )
  })

  it('支付宝：RSA2 验签 + TRADE_SUCCESS 解析，应答为纯文本 success', async () => {
    process.env.ALIPAY_APP_ID = 'APP1'
    process.env.ALIPAY_PRIVATE_KEY = PRIV
    process.env.ALIPAY_PUBLIC_KEY = PUB
    process.env.ALIPAY_GATEWAY = 'https://openapi.test/gateway.do'
    const fields: Record<string, string> = {
      app_id: 'APP1',
      trade_status: 'TRADE_SUCCESS',
      out_trade_no: 'PCNY123',
      trade_no: 'ALI1',
      total_amount: '100.00',
      sign_type: 'RSA2',
      notify_time: '2026-11-09 12:00:00',
    }
    fields.sign = rsaSign(PRIV, sortedKv(fields, ['sign', 'sign_type']))
    const event = await alipayGateway.verifyAndParse({ rawBody: Buffer.from(new URLSearchParams(fields).toString()), headers: {}, config: {} })
    expect(event.type).toBe('payment.succeeded')
    expect(event.gatewayOrderNo).toBe('PCNY123')
    expect(event.amountCents).toBe(10000)
    expect(alipayGateway.successResponse?.()).toEqual({ contentType: 'text/plain', body: 'success' })
  })

  it('微信支付 APIv3：头验签 + AES-GCM 解密 resource，应答为 JSON SUCCESS', async () => {
    const apiV3Key = '0123456789abcdef0123456789abcdef'
    process.env.WECHAT_MCH_ID = 'M1'
    process.env.WECHAT_APP_ID = 'APP1'
    process.env.WECHAT_API_V3_KEY = apiV3Key
    process.env.WECHAT_SERIAL_NO = 'SERIAL1'
    process.env.WECHAT_PRIVATE_KEY = PRIV
    process.env.WECHAT_PLATFORM_PUBLIC_KEY = PUB
    const plain = { out_trade_no: 'PCNY456', trade_state: 'SUCCESS', transaction_id: 'WX1', amount: { payer_total: 10000, total: 10000, currency: 'CNY' } }
    const nonce = 'abcdefghijkl'
    const associatedData = 'transaction'
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(nonce))
    cipher.setAAD(Buffer.from(associatedData))
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(plain)), cipher.final(), cipher.getAuthTag()]).toString('base64')
    const raw = JSON.stringify({ resource: { ciphertext, nonce, associated_data: associatedData } })
    const ts = String(Math.floor(Date.now() / 1000))
    const signature = rsaSign(PRIV, `${ts}\n${nonce}\n${raw}\n`)
    const event = await wechatGateway.verifyAndParse({
      rawBody: Buffer.from(raw),
      headers: { 'wechatpay-timestamp': ts, 'wechatpay-nonce': nonce, 'wechatpay-signature': signature },
      config: {},
    })
    expect(event.type).toBe('payment.succeeded')
    expect(event.gatewayOrderNo).toBe('PCNY456')
    expect(event.amountCents).toBe(10000)
    expect(wechatGateway.successResponse?.().body).toContain('SUCCESS')
  })

  it('PayPal：走 verify-webhook-signature 验签接口，验签状态非 SUCCESS 直接拒绝', async () => {
    process.env.PAYPAL_CLIENT_ID = 'CID'
    process.env.PAYPAL_CLIENT_SECRET = 'SECRET'
    process.env.PAYPAL_ENV = 'sandbox'
    process.env.PAYPAL_WEBHOOK_ID = 'WH1'
    const raw = { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP1', custom_id: 'PUSD999', amount: { value: '100.00', currency_code: 'USD' } } }
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/v1/oauth2/token')) return { ok: true, text: async () => JSON.stringify({ access_token: 'TK' }) }
      return { ok: true, text: async () => JSON.stringify({ verification_status: 'SUCCESS' }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const event = await paypalGateway.verifyAndParse({
      rawBody: Buffer.from(JSON.stringify(raw)),
      headers: {
        'paypal-transmission-id': 'T1',
        'paypal-transmission-sig': 'S1',
        'paypal-transmission-time': '2026-11-09T00:00:00Z',
        'paypal-cert-url': 'https://cert',
        'paypal-auth-algo': 'SHA256withRSA',
      },
      config: {},
    })
    expect(event.type).toBe('payment.succeeded')
    expect(event.gatewayOrderNo).toBe('PUSD999')
    expect(event.currency).toBe('USD')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        text: async () => JSON.stringify(String(url).includes('/v1/oauth2/token') ? { access_token: 'TK' } : { verification_status: 'FAILURE' }),
      })),
    )
    await expect(paypalGateway.verifyAndParse({ rawBody: Buffer.from(JSON.stringify(raw)), headers: {}, config: {} })).rejects.toThrow(/验签失败/)
  })
})
