import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 通用营销通知 outbox 状态 */
export type MailOutboxStatus = 'pending' | 'sent' | 'failed'

/**
 * 通用营销通知 outbox（降价提醒 / 到货通知 / 弃购召回等）。
 * 与 ShopOrderEmail 区分：后者绑死 orderId（订单事务邮件），本表通用、面向顾客或裸邮箱。
 * uq(tenantId, type, dedupeKey) 幂等：同一通知（如某顾客某商品降价）只入队一次。
 */
class ShopMailOutbox extends Model<InferAttributes<ShopMailOutbox>, InferCreationAttributes<ShopMailOutbox>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare type: string
  declare toEmail: string
  declare customerId: number | null
  declare subject: string
  declare bodyText: string
  declare dedupeKey: CreationOptional<string>
  declare status: CreationOptional<MailOutboxStatus>
  declare error: string | null
  declare sentAt: Date | null
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopMailOutbox.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    type: { type: DataTypes.STRING(40), allowNull: false, comment: 'price_drop/restock/back_in_stock/...' },
    toEmail: { type: DataTypes.STRING(255), allowNull: false, comment: '收件邮箱' },
    customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '关联顾客ID（可空）' },
    subject: { type: DataTypes.STRING(255), allowNull: false, comment: '邮件主题' },
    bodyText: { type: DataTypes.TEXT, allowNull: false, comment: '邮件正文（纯文本）' },
    dedupeKey: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: '',
      comment: '去重键（uq tenant+type+dedupeKey）',
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
      comment: '投递状态',
    },
    error: { type: DataTypes.TEXT, allowNull: true, comment: '失败原因' },
    sentAt: { type: DataTypes.DATE, allowNull: true, comment: '发送时间' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'shop_mail_outbox',
    indexes: [
      { name: 'uq_mail_outbox_tenant_type_dedupe', unique: true, fields: ['tenantId', 'type', 'dedupeKey'] },
      { name: 'idx_mail_outbox_tenant_status', fields: ['tenantId', 'status'] },
    ],
  },
)

export default ShopMailOutbox
