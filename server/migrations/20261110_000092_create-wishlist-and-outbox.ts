import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 收藏夹 Wishlist（C 端顾客，推荐算法行为数据底座）：
 * - shop_wishlists：顾客收藏商品（按 SPU/productId 收藏，前台商品卡即 SPU 单位）。
 *   uq(tenantId, customerId, productId) 幂等，重复收藏只落一条。
 * - shop_mail_outbox：通用营销通知 outbox（降价提醒等）。
 *   与 shop_order_emails 区分：后者绑死 orderId，仅订单事务邮件；本表通用、面向顾客/邮箱。
 * 幂等：up/down 均先探测存在性。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]

  if (!tables.includes('shop_wishlists')) {
    await queryInterface.createTable('shop_wishlists', {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
      siteId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '站点ID（shops.id），多站点隔离' },
      customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '顾客ID（customers.id）' },
      productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '商品ID（spus.id）' },
      notifyOnSale: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, comment: '降价时是否邮件提醒' },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('shop_wishlists', ['tenantId', 'customerId', 'productId'], {
      name: 'uq_wishlists_tenant_customer_product',
      unique: true,
    })
    await queryInterface.addIndex('shop_wishlists', ['tenantId', 'productId'], {
      name: 'idx_wishlists_tenant_product',
    })
  }

  if (!tables.includes('shop_mail_outbox')) {
    await queryInterface.createTable('shop_mail_outbox', {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
      type: { type: DataTypes.STRING(40), allowNull: false, comment: '通知类型 price_drop/restock/back_in_stock/...' },
      toEmail: { type: DataTypes.STRING(255), allowNull: false, comment: '收件邮箱' },
      customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '关联顾客ID（可空=非顾客）' },
      subject: { type: DataTypes.STRING(255), allowNull: false, comment: '邮件主题' },
      bodyText: { type: DataTypes.TEXT, allowNull: false, comment: '邮件正文（纯文本）' },
      dedupeKey: { type: DataTypes.STRING(128), allowNull: false, defaultValue: '', comment: '去重键（uq tenant+type+dedupeKey 幂等）' },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending', comment: 'pending/sent/failed' },
      error: { type: DataTypes.TEXT, allowNull: true, comment: '发送失败原因' },
      sentAt: { type: DataTypes.DATE, allowNull: true, comment: '发送时间' },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('shop_mail_outbox', ['tenantId', 'type', 'dedupeKey'], {
      name: 'uq_mail_outbox_tenant_type_dedupe',
      unique: true,
    })
    await queryInterface.addIndex('shop_mail_outbox', ['tenantId', 'status'], {
      name: 'idx_mail_outbox_tenant_status',
    })
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (tables.includes('shop_mail_outbox')) await queryInterface.dropTable('shop_mail_outbox')
  if (tables.includes('shop_wishlists')) await queryInterface.dropTable('shop_wishlists')
}
