import type { QueryInterface } from 'sequelize'
import sequelize from '../config/database.js'

/**
 * T-08 配送范围：种入站点配送配置（唯一数据源 settings.optionKey='shop.shipping'）。
 *
 * 与币种治理同源（settings 表 + JSON 配置），不新增第二套配置后端。
 * - mode=whitelist：仅 allowedCountries 内的 ISO-3166-1 alpha-2 国家可配送；
 * - zones：分区运费（单位：分），命中优先；未命中走 defaultShippingCents；
 * - 幂等：已存在则不覆盖运营已修改的配置。
 */
const KEY = 'shop.shipping'
const CONFIG = {
  mode: 'whitelist',
  allowedCountries: ['US', 'CA', 'GB', 'DE', 'FR', 'AU', 'CN', 'JP', 'SG'],
  zones: [
    { countries: ['US', 'CA'], shippingCents: 800 },
    { countries: ['CN', 'JP', 'SG'], shippingCents: 1200 },
  ],
  defaultShippingCents: 1500,
}

export async function up(_queryInterface: QueryInterface): Promise<void> {
  const [tables] = await sequelize.query("SHOW TABLES LIKE 'settings'")
  if ((tables as any[]).length === 0) return

  const [rows] = (await sequelize.query('SELECT id FROM settings WHERE optionKey = ? LIMIT 1', {
    replacements: [KEY],
  })) as any
  if (rows.length > 0) return

  await sequelize.query(
    'INSERT INTO settings (optionKey, optionValue, autoload, description, createdAt, updatedAt) VALUES (?, ?, 1, ?, NOW(), NOW())',
    {
      replacements: [KEY, JSON.stringify(CONFIG), '独立站配送范围与分区运费配置（T-08 / P3-T05）'],
    },
  )
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  await sequelize.query('DELETE FROM settings WHERE optionKey = ?', { replacements: [KEY] })
}
