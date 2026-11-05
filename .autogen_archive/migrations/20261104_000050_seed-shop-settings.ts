import type { QueryInterface } from 'sequelize'

/**
 * P1-T06 / P0-T07：商城设置种子（显式写入 ≠ 隐式默认，C7 fail-closed）。
 * - shop.currency：单一启用币种（JSON CurrencyConfig），Store Config 唯一数据源
 * - shop.shipping.rates / shop.tax.rates：运费与税率规则表（MARKET_STRATEGY §3/§4 默认值，待业务复核）
 */
const SEEDS: { key: string; value: unknown; description: string }[] = [
  {
    key: 'shop.currency',
    value: { code: 'USD', symbol: '$', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', locale: 'en-US' },
    description: '单一启用币种（C1/C7：缺失或非法时 fail-closed，禁止默认 USD 兜底）',
  },
  {
    key: 'shop.shipping.countries',
    value: ['US', 'CA', 'GB', 'AU', 'DE', 'FR'],
    description: '可配送国家清单（ADDRESS_NOT_SHIPPABLE 判定）',
  },
  {
    key: 'shop.shipping.rates',
    value: [
      { id: 'std', name: 'Standard', countries: ['*'], amountCents: 999, etaDays: '7-12' },
      { id: 'exp', name: 'Express', countries: ['US', 'CA'], amountCents: 1999, etaDays: '3-5' },
    ],
    description: '运费规则（amountCents 为整数分；运费币种=启用币种）',
  },
  {
    key: 'shop.tax.rates',
    value: [
      { country: 'US', rateBps: 700 },
      { country: 'CA', rateBps: 500 },
      { country: 'GB', rateBps: 0 },
      { country: 'AU', rateBps: 0 },
      { country: 'DE', rateBps: 0 },
      { country: 'FR', rateBps: 0 },
    ],
    description: '简化税率规则表（rateBps 万分比；上线前由税务顾问复核，见 MARKET_STRATEGY §6）',
  },
]

export async function up(queryInterface: QueryInterface): Promise<void> {
  for (const seed of SEEDS) {
    await queryInterface.sequelize.query(
      `INSERT INTO settings (optionKey, optionValue, autoload, description, createdAt, updatedAt)
       VALUES (:key, :value, 1, :description, NOW(), NOW())
       ON DUPLICATE KEY UPDATE description = VALUES(description)`,
      { replacements: { key: seed.key, value: JSON.stringify(seed.value), description: seed.description } },
    )
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    `DELETE FROM settings WHERE optionKey IN (:keys)`,
    { replacements: { keys: SEEDS.map((s) => s.key) } },
  )
}
