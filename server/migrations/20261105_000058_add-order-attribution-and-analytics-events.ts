import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 阶段 5 步骤 6：订单来源字段（site / utm）+ 服务端 CAPI 埋点事件表
 *
 * - orders 增补归因列：来源站点 + UTM 五参数 + 落地页 + referrer（全部可空，存量订单不受影响）。
 * - shop_analytics_events：服务端事件落库 + (tenantId,eventId) 幂等去重 + 同意门控与派发状态留痕。
 * 与 shop 模块共用同一套模型层，不建第二套后端。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  // —— 订单来源（site / utm）——
  await queryInterface.addColumn('orders', 'sourceSiteId', {
    type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '下单来源站点ID（shops.id）',
  })
  for (const [col, len, comment] of [
    ['utmSource', 120, 'UTM source'],
    ['utmMedium', 120, 'UTM medium'],
    ['utmCampaign', 200, 'UTM campaign'],
    ['utmTerm', 200, 'UTM term'],
    ['utmContent', 200, 'UTM content'],
    ['landingPage', 512, '首次落地页'],
    ['referrer', 512, '来源 referrer'],
  ] as const) {
    await queryInterface.addColumn('orders', col, {
      type: DataTypes.STRING(len), allowNull: true, comment,
    })
  }
  await queryInterface.addIndex('orders', ['tenantId', 'utmSource', 'utmCampaign'], {
    name: 'idx_orders_attribution',
  })

  // —— 服务端 CAPI 埋点事件 ——
  await queryInterface.createTable('shop_analytics_events', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    siteId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '站点ID（shops.id）' },
    eventId: { type: DataTypes.STRING(64), allowNull: false, comment: '客户端事件ID（幂等去重）' },
    eventName: { type: DataTypes.STRING(40), allowNull: false, comment: '事件名（GA4 九事件 + refund）' },
    consentAnalytics: {
      type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, comment: 'Cookie 同意：analytics 是否授予',
    },
    customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '登录顾客ID' },
    sessionId: { type: DataTypes.STRING(64), allowNull: true, comment: '匿名会话ID' },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '关联订单ID（服务端事实校验后回填）' },
    transactionId: { type: DataTypes.STRING(64), allowNull: true, comment: '交易号/订单号' },
    currency: { type: DataTypes.STRING(3), allowNull: true, comment: '金额币种（取订单快照）' },
    valueCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '事件金额(分)' },
    params: { type: DataTypes.JSON, allowNull: true, comment: '完整事件参数（脱敏后）' },
    dispatchStatus: {
      type: DataTypes.STRING(24), allowNull: false, defaultValue: 'local_only',
      comment: 'local_only/sent/skipped_no_consent/failed',
    },
    dispatchedAt: { type: DataTypes.DATE, allowNull: true, comment: 'CAPI 派发时间' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('shop_analytics_events', ['tenantId', 'eventId'], {
    name: 'uniq_analytics_tenant_event', unique: true,
  })
  await queryInterface.addIndex('shop_analytics_events', ['tenantId', 'siteId', 'eventName', 'createdAt'], {
    name: 'idx_analytics_tenant_site_event_time',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('shop_analytics_events')
  await queryInterface.removeIndex('orders', 'idx_orders_attribution')
  for (const col of [
    'sourceSiteId', 'utmSource', 'utmMedium', 'utmCampaign', 'utmTerm', 'utmContent', 'landingPage', 'referrer',
  ]) {
    await queryInterface.removeColumn('orders', col)
  }
}
