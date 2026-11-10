import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

export type MailRecipientType = 'customer' | 'user' | 'bare'
export type MailRecipientStatus = 'pending' | 'sent' | 'failed'

/** 营销邮件收件人明细（uq campaign+email 防重复投递） */
class ShopMailCampaignRecipient extends Model<
  InferAttributes<ShopMailCampaignRecipient>,
  InferCreationAttributes<ShopMailCampaignRecipient>
> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare campaignId: number
  declare recipientType: MailRecipientType
  declare recipientId: number | null
  declare email: string
  declare status: CreationOptional<MailRecipientStatus>
  declare error: string | null
  declare sentAt: Date | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopMailCampaignRecipient.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    campaignId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    recipientType: { type: DataTypes.STRING(16), allowNull: false, comment: 'customer/user/bare' },
    recipientId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    email: { type: DataTypes.STRING(255), allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'pending', comment: 'pending/sent/failed' },
    error: { type: DataTypes.STRING(500), allowNull: true },
    sentAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'mail_campaign_recipients',
    indexes: [
      { fields: ['campaignId', 'status'], name: 'idx_recipients_campaign_status' },
      { unique: true, fields: ['tenantId', 'campaignId', 'email'], name: 'uq_recipients_campaign_email' },
    ],
  },
)

export default ShopMailCampaignRecipient
