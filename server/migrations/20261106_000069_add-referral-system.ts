import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * P5-T07：Referral / Affiliate 归因与结算。
 *
 * - customers.referralCode：每位顾客可分享的推荐码（租户内唯一，可空；创建时自动生成）。
 * - orders.referralCode / orders.referralTouchAt：建单时快照推荐码与首次触点时间（归因窗口依据）。
 * - referral_commissions：佣金台账（pending → settled / void）。
 *   - 归因窗口：referralTouchAt 起 N 天（默认 30，`REFERRAL_WINDOW_DAYS`）；
 *   - 与优惠券叠加规则：佣金基数 = 订单净额（已扣除优惠券/促销/Bundle 折扣后的 amountCents）；
 *   - 佣金币种 = 订单币种（= 结算币种），不换算。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('customers', 'referralCode', {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: '推荐码（租户内唯一，创建时自动生成）',
  })
  await queryInterface.addIndex('customers', ['tenantId', 'referralCode'], {
    unique: true,
    name: 'uq_customers_tenant_referral_code',
  })

  await queryInterface.addColumn('orders', 'referralCode', {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: '建单快照：使用的推荐码',
  })
  await queryInterface.addColumn('orders', 'referralTouchAt', {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '建单快照：推荐首次触点时间（归因窗口起点）',
  })

  await queryInterface.createTable('referral_commissions', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '订单ID' },
    referrerCustomerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '推荐人顾客ID' },
    code: { type: DataTypes.STRING(64), allowNull: false, comment: '使用的推荐码' },
    orderCurrency: { type: DataTypes.STRING(3), allowNull: false, comment: '订单币种（=结算币种）' },
    orderNetAmountCents: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: '佣金基数（订单净额，已扣除优惠券/促销/Bundle 折扣，单位分）',
    },
    commissionRatePercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, comment: '佣金比例（%）' },
    commissionCents: { type: DataTypes.BIGINT, allowNull: false, comment: '应结佣金（分，与订单同币种）' },
    status: {
      type: DataTypes.ENUM('pending', 'settled', 'void'),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'pending 待结 / settled 已结 / void 作废（窗口失效等）',
    },
    windowExpiredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '归因窗口失效时间（referralTouchAt + 窗口天数）',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('referral_commissions', ['tenantId', 'referrerCustomerId'])
  await queryInterface.addIndex('referral_commissions', ['tenantId', 'status'])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('referral_commissions')
  await queryInterface.removeColumn('orders', 'referralTouchAt')
  await queryInterface.removeColumn('orders', 'referralCode')
  await queryInterface.removeIndex('customers', 'uq_customers_tenant_referral_code')
  await queryInterface.removeColumn('customers', 'referralCode')
}
