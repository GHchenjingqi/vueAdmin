import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * T-07 优惠券门禁：用量上限/已用计数 + 核销流水表。
 *
 * 复用库里既有的 coupon_redemptions 结构（列名 code / 唯一键 tenantId+orderNo），
 * 不新建第二套表。迁移按「列/表/索引是否存在」逐步补齐，因此：
 * - 已有历史列或历史表的环境：原样保留运营数据，只补缺失部分；
 * - 全新环境：完整创建，保证可自包含重建。
 *
 * usageLimit：0 / NULL 均表示不限量（兼容历史 nullable 列）。
 */
const TABLE = 'coupon_redemptions'

export async function up(queryInterface: QueryInterface): Promise<void> {
  const couponCols = await queryInterface.describeTable('coupons') as Record<string, unknown>
  if (!couponCols.usageLimit) {
    await queryInterface.addColumn('coupons', 'usageLimit', {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '最大使用次数，0=不限量',
    })
  }
  if (!couponCols.usedCount) {
    await queryInterface.addColumn('coupons', 'usedCount', {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '已使用次数',
    })
  }

  const tables = await queryInterface.showAllTables()
  if (!tables.includes(TABLE)) {
    await queryInterface.createTable(TABLE, {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      couponId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      code: { type: DataTypes.STRING(64), allowNull: false },
      orderNo: { type: DataTypes.STRING(64), allowNull: false },
      discountCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '优惠金额（整数分）' },
      currency: { type: DataTypes.STRING(3), allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    })
  }

  const indexes = (await queryInterface.showIndex(TABLE)) as any[]
  const indexNames = indexes.map((i) => i.name ?? i.Key_name)
  if (!indexNames.includes('uq_redemption_order')) {
    await queryInterface.addIndex(TABLE, ['tenantId', 'orderNo'], { name: 'uq_redemption_order', unique: true })
  }
  if (!indexNames.includes('idx_redemption_coupon')) {
    await queryInterface.addIndex(TABLE, ['tenantId', 'couponId'], { name: 'idx_redemption_coupon' })
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = await queryInterface.showAllTables()
  if (tables.includes(TABLE)) await queryInterface.dropTable(TABLE)
  const cols = (await queryInterface.describeTable('coupons')) as Record<string, unknown>
  if (cols.usedCount) await queryInterface.removeColumn('coupons', 'usedCount')
  if (cols.usageLimit) await queryInterface.removeColumn('coupons', 'usageLimit')
}
