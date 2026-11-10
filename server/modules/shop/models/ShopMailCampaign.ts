import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

export type MailAudienceType = 'all_customers' | 'tier' | 'all_users' | 'emails'
export type MailCampaignStatus = 'pending' | 'sending' | 'sent' | 'partial' | 'failed'

/** 营销邮件任务（对会员/用户群发；outbox 逐封投递，可重试） */
class ShopMailCampaign extends Model<InferAttributes<ShopMailCampaign>, InferCreationAttributes<ShopMailCampaign>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare subject: string
  declare body: string
  declare audienceType: MailAudienceType
  declare audienceParam: string | null
  declare status: CreationOptional<MailCampaignStatus>
  declare totalCount: CreationOptional<number>
  declare sentCount: CreationOptional<number>
  declare failedCount: CreationOptional<number>
  declare operatorId: number | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopMailCampaign.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    subject: { type: DataTypes.STRING(200), allowNull: false, comment: '邮件主题' },
    body: { type: DataTypes.TEXT, allowNull: false, comment: '正文（支持 {{nickname}} {{points}} 变量）' },
    audienceType: { type: DataTypes.STRING(32), allowNull: false, comment: 'all_customers/tier/all_users/emails' },
    audienceParam: { type: DataTypes.STRING(255), allowNull: true, comment: 'tier 等级ID / emails 逗号分隔' },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'pending', comment: 'pending/sending/sent/partial/failed' },
    totalCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sentCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    failedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    operatorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'mail_campaigns',
    indexes: [{ fields: ['tenantId', 'createdAt'], name: 'idx_campaigns_tenant_time' }],
  },
)

export default ShopMailCampaign
