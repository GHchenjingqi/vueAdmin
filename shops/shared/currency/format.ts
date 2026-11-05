import type { CurrencyConfig } from '../types/currency'

/**
 * 唯一格式化入口（C4）：全站仅此一处实现，基于 Intl.NumberFormat。
 * amount 为整数最小单位（C2）；格式化所需币种一律来自 CurrencyConfig（C1：禁止硬编码符号）。
 */
export function formatMoney(amount: number, cfg: CurrencyConfig): string {
  const value = amount / 10 ** cfg.decimalDigits
  return new Intl.NumberFormat(cfg.locale, {
    style: 'currency',
    currency: cfg.code,
    minimumFractionDigits: cfg.decimalDigits,
    maximumFractionDigits: cfg.decimalDigits,
  }).format(value)
}

/** 溢出安全校验：金额必须是非负安全整数（C2） */
export function assertMoneyAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`invalid money amount: ${amount}`)
  }
}
