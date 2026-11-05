import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 阶段 5 步骤 5（第五切片）：物流轨迹缓存 shop_tracking_events
 * 复用 shop 订单与 order_shipments（carrier/trackingNo 已在），此处仅缓存 17track 拉取的轨迹事件，
 * 避免每次查询都打外部 API；tenantId + shipmentId 隔离，与 shop 模块共用同一套模型层。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('shop_tracking_events', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    siteId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '站点ID（shops.id）' },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '订单ID' },
    shipmentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '物流单ID（order_shipments.id）' },
    carrier: { type: DataTypes.STRING(100), allowNull: true, comment: '承运商' },
    trackingNo: { type: DataTypes.STRING(100), allowNull: true, comment: '运单号' },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'created',
      comment: '物流状态（created/in_transit/delivered/exception）',
    },
    events: { type: DataTypes.JSON, allowNull: true, comment: '轨迹事件数组 [{time,description,location,status}]' },
    provider: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'local', comment: '轨迹来源 provider' },
    syncedAt: { type: DataTypes.DATE, allowNull: false, comment: '最近一次同步时间' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('shop_tracking_events', ['tenantId', 'shipmentId'], {
    name: 'uniq_tracking_tenant_shipment',
    unique: true,
  })
  await queryInterface.addIndex('shop_tracking_events', ['tenantId', 'orderId'], {
    name: 'idx_tracking_tenant_order',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('shop_tracking_events')
}
