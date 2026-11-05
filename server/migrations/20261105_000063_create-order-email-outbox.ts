import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * P3-T17 / T-12 订单邮件通知（确认 / 发货 / 退款）
 *
 * Outbox 在**入队时**就把渲染好的主题与正文连同订单币种快照一起落库：
 * - 发送 / 重试只读 outbox 快照，不重新读站点币种配置，历史订单邮件币种永不漂移；
 * - (tenantId,type,orderId,dedupeKey) 唯一，重复 Webhook / 重复发货回执不重复发信；
 * - attempts + nextAttemptAt 支持有界指数退避重试；dead 为最终失败态，可人工介入。
 *
 * 金额一律整数「分」；邮件正文不落任何支付凭据（卡号 / providerRef / accessToken）。
 * 迁移按「表/索引是否存在」逐步补齐，可在已有历史表的环境重复执行。
 */
const TABLE = 'shop_order_email_outbox'

export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = await queryInterface.showAllTables()
  if (!tables.includes(TABLE)) {
    await queryInterface.createTable(TABLE, {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      orderNo: { type: DataTypes.STRING(64), allowNull: false },
      type: { type: DataTypes.ENUM('confirmed', 'shipped', 'refunded'), allowNull: false },
      dedupeKey: { type: DataTypes.STRING(128), allowNull: false, defaultValue: '' },
      toEmail: { type: DataTypes.STRING(255), allowNull: false },
      subject: { type: DataTypes.STRING(255), allowNull: false },
      bodyText: { type: DataTypes.TEXT, allowNull: false, comment: '入队时固化的纯文本正文（金额按订单快照币种渲染）' },
      currency: { type: DataTypes.STRING(3), allowNull: false, comment: '订单快照币种' },
      amountCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '本邮件主金额（整数分）' },
      status: { type: DataTypes.ENUM('pending', 'sent', 'failed', 'dead'), allowNull: false, defaultValue: 'pending' },
      attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      nextAttemptAt: { type: DataTypes.DATE, allowNull: true },
      lastError: { type: DataTypes.STRING(255), allowNull: true },
      sentAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    })
  }

  const indexes = (await queryInterface.showIndex(TABLE)) as any[]
  const names = indexes.map((i) => i.name ?? i.Key_name)
  if (!names.includes('uq_order_mail_dedupe')) {
    await queryInterface.addIndex(TABLE, ['tenantId', 'type', 'orderId', 'dedupeKey'], {
      name: 'uq_order_mail_dedupe',
      unique: true,
    })
  }
  if (!names.includes('idx_order_mail_due')) {
    await queryInterface.addIndex(TABLE, ['status', 'nextAttemptAt'], { name: 'idx_order_mail_due' })
  }
  if (!names.includes('idx_order_mail_order')) {
    await queryInterface.addIndex(TABLE, ['tenantId', 'orderId'], { name: 'idx_order_mail_order' })
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = await queryInterface.showAllTables()
  if (tables.includes(TABLE)) await queryInterface.dropTable(TABLE)
}
