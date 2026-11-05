import type { StoreConfig } from '@shared/types/currency'

/**
 * BFF：Store Config（P1-T06）。
 * 直连现有后台 /api/storefront/v1/store-config（settings 唯一数据源，契约不变）。
 * 后台不可达/配置缺失 → fail-closed 503（C7：禁止默认 USD 兜底）。币种不得进环境变量（P1-T03）。
 */
export default defineEventHandler(async (): Promise<StoreConfig> => {
  if (process.env.NUXT_API_INSECURE_TLS === '1') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  const base = process.env.STOREFRONT_API_BASE || 'https://127.0.0.1:5173'
  const res = await fetch(`${base}/api/storefront/v1/store-config`).catch(() => undefined)
  if (!res || !res.ok) {
    throw createError({ statusCode: 503, statusMessage: 'SHOP_CURRENCY_CONFIG_UNAVAILABLE' })
  }
  const body = (await res.json()) as { code: number; data: StoreConfig }
  if (body.code !== 0 || !body.data) {
    throw createError({ statusCode: 503, statusMessage: 'SHOP_CURRENCY_CONFIG_UNAVAILABLE' })
  }
  return body.data
})
