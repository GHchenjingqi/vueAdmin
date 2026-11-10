import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 会员系统（C 端顾客）：
 * - membership_tiers：会员等级表（租户内唯一，level 升序，growthThreshold 成长值门槛，discountPct 权益折扣%）
 * - customers 加列：membershipTierId（当前等级）、points（可用积分）、growthValue（累计成长值）
 * - points_logs：积分流水（change 正负、reason、orderId 可空；幂等键 uq_tenant_order_reason）
 * 幂等：up/down 均先探测存在性；不动存量数据。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]

  if (!tables.includes('membership_tiers')) {
    await queryInterface.createTable('membership_tiers', {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
      name: { type: DataTypes.STRING(64), allowNull: false, comment: '等级名' },
      level: { type: DataTypes.INTEGER, allowNull: false, comment: '等级序号（1 起，升序）' },
      growthThreshold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '成长值门槛（>=）' },
      discountPct: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '权益折扣%（0-100，95=95折）' },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('membership_tiers', ['tenantId', 'level'], { unique: true, name: 'uq_tiers_tenant_level' })
    await queryInterface.addIndex('membership_tiers', ['tenantId', 'name'], { unique: true, name: 'uq_tiers_tenant_name' })
  }

  if (!tables.includes('customers')) {
    // customers 表由既有迁移创建；此处仅当表缺失时跳过加列（正常路径表已存在）
  } else {
    const columns = (await queryInterface.describeTable('customers')) as Record<string, unknown>
    if (!columns.membershipTierId) {
      await queryInterface.addColumn('customers', 'membershipTierId', {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: '当前会员等级（membership_tiers.id，应用层保证一致性）',
      })
    }
    if (!columns.points) {
      await queryInterface.addColumn('customers', 'points', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '可用积分',
      })
    }
    if (!columns.growthValue) {
      await queryInterface.addColumn('customers', 'growthValue', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '累计成长值（决定等级）',
      })
    }
  }

  if (!tables.includes('points_logs')) {
    await queryInterface.createTable('points_logs', {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
      customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '顾客ID' },
      change: { type: DataTypes.INTEGER, allowNull: false, comment: '积分变动（正=发放 负=扣减）' },
      balanceAfter: { type: DataTypes.INTEGER, allowNull: false, comment: '变动后余额' },
      reason: { type: DataTypes.STRING(64), allowNull: false, comment: 'order_captured/manual/adjust' },
      orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '关联订单（可空）' },
      operatorType: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'system', comment: 'system/admin' },
      operatorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '管理员ID（manual 时）' },
      note: { type: DataTypes.STRING(255), allowNull: true, comment: '备注' },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('points_logs', ['tenantId', 'customerId', 'createdAt'], { name: 'idx_points_tenant_customer_time' })
    await queryInterface.addIndex('points_logs', ['tenantId', 'orderId', 'reason'], { unique: true, name: 'uq_points_tenant_order_reason' })
  }

  // 默认等级种子（每个租户 4 级；只补缺，不覆盖已有）
  const [tenants] = (await queryInterface.sequelize.query(
    'SELECT DISTINCT tenantId FROM customers',
  )) as [{ tenantId: number }[], unknown]
  for (const { tenantId } of tenants ?? []) {
    const [existing] = (await queryInterface.sequelize.query(
      'SELECT id FROM membership_tiers WHERE tenantId = :tid LIMIT 1',
      { replacements: { tid: tenantId } },
    )) as [{ id: number }[], unknown]
    if (existing?.length) continue
    const now = new Date()
    await queryInterface.bulkInsert('membership_tiers', [
      { tenantId, name: '普通会员', level: 1, growthThreshold: 0, discountPct: 0, createdAt: now, updatedAt: now },
      { tenantId, name: '白银会员', level: 2, growthThreshold: 1000, discountPct: 98, createdAt: now, updatedAt: now },
      { tenantId, name: '黄金会员', level: 3, growthThreshold: 5000, discountPct: 95, createdAt: now, updatedAt: now },
      { tenantId, name: '铂金会员', level: 4, growthThreshold: 20000, discountPct: 92, createdAt: now, updatedAt: now },
    ])
    // 存量顾客挂到本租户 level 1（无等级的挂普通会员）
    const [t1] = (await queryInterface.sequelize.query(
      'SELECT id FROM membership_tiers WHERE tenantId = :tid AND level = 1 LIMIT 1',
      { replacements: { tid: tenantId } },
    )) as [{ id: number }[], unknown]
    if (t1?.length) {
      await queryInterface.sequelize.query(
        'UPDATE customers SET membershipTierId = :tid1 WHERE tenantId = :tid AND membershipTierId IS NULL',
        { replacements: { tid1: t1[0].id, tid: tenantId } },
      )
    }
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (tables.includes('customers')) {
    const columns = (await queryInterface.describeTable('customers')) as Record<string, unknown>
    if (columns.membershipTierId) await queryInterface.removeColumn('customers', 'membershipTierId')
    if (columns.points) await queryInterface.removeColumn('customers', 'points')
    if (columns.growthValue) await queryInterface.removeColumn('customers', 'growthValue')
  }
  if (tables.includes('points_logs')) await queryInterface.dropTable('points_logs')
  if (tables.includes('membership_tiers')) await queryInterface.dropTable('membership_tiers')
}
