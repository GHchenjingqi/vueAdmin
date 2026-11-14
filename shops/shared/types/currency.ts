/**
 * 币种配置类型（P1-T06 / C1-C4）
 * 单一启用币种：值来自后台商城设置（本阶段由 /api/store-config BFF 提供 mock），
 * 前端零硬编码货币符号；金额一律整数最小单位。
 */
export interface CurrencyConfig {
  code: string
  symbol: string
  decimalDigits: number
  symbolPosition: 'before' | 'after'
  thousandsSeparator: string
  decimalSeparator: string
  locale: string
}

export interface StoreConfig {
  currency: CurrencyConfig
  market: { country: string; language: string }
  /** 站点名（后台 site_title 下发；用于标题模板、og:site_name、Organization） */
  siteName?: string
  version: string
}

/** 金额对象（C3：任何金额必带 currency，禁止裸数字跨层传递） */
export interface Money {
  amount: number
  currency: string
}

export const DEFAULT_CURRENCY_CONFIG: CurrencyConfig = {
  code: 'USD',
  symbol: '$',
  decimalDigits: 2,
  symbolPosition: 'before',
  thousandsSeparator: ',',
  decimalSeparator: '.',
  locale: 'en-US',
}
