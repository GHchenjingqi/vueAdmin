import type { QueryInterface } from 'sequelize'
import sequelize from '../config/database.js'

/**
 * 独立站单一启用币种：种入 settings.optionKey='shop.currency' 的默认 USD 配置。
 *
 * 背景：currencyConfig.ts 采用 fail-closed（缺失即 503 SHOP_CURRENCY_CONFIG_MISSING），
 * 原先只有后台「币种设置」点保存时才会 upsert 该键，导致全新空库迁移完成后
 * /api/storefront/v1/store-config、结算与下单全部 503，必须人工介入。
 *
 * 幂等约束：
 * - up：仅在该键不存在时插入，绝不覆盖运营在后台修改过的币种配置；
 * - down：仅在该键仍等于本种子默认值时删除，避免回滚误删运营配置。
 *
 * 配置结构须与 currencyConfig.ts 的 CurrencyConfig / validateCurrencyConfig 对齐。
 */
const KEY = 'shop.currency'
const CONFIG = {
  code: 'USD',
  symbol: '$',
  decimalDigits: 2,
  symbolPosition: 'before',
  thousandsSeparator: ',',
  decimalSeparator: '.',
  locale: 'en-US',
}
const VALUE = JSON.stringify(CONFIG)
const DESCRIPTION = '单一启用币种（C1/C7：缺失或非法时 fail-closed，禁止默认 USD 兜底）'

export async function up(_queryInterface: QueryInterface): Promise<void> {
  const [tables] = await sequelize.query("SHOW TABLES LIKE 'settings'")
  if ((tables as any[]).length === 0) return

  const [rows] = (await sequelize.query('SELECT id FROM settings WHERE optionKey = ? LIMIT 1', {
    replacements: [KEY],
  })) as any
  if (rows.length > 0) return

  await sequelize.query(
    'INSERT INTO settings (optionKey, optionValue, autoload, description, createdAt, updatedAt) VALUES (?, ?, 1, ?, NOW(), NOW())',
    { replacements: [KEY, VALUE, DESCRIPTION] },
  )
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  await sequelize.query('DELETE FROM settings WHERE optionKey = ? AND optionValue = ?', {
    replacements: [KEY, VALUE],
  })
}
