import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 邮件订阅状态 */
export type NewsletterStatus = 'subscribed' | 'unsubscribed' | 'pending'

class ShopNewsletter extends Model<InferAttributes<ShopNewsletter>, InferCreationAttributes<ShopNewsletter>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare email: string
  declare status: CreationOptional<NewsletterStatus>
  declare source: CreationOptional<string | null>
  declare locale: CreationOptional<string | null>
  declare token: string
  declare subscribedAt: CreationOptional<Date | null>
  declare unsubscribedAt: CreationOptional<Date | null>
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopNewsletter.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    email: { type: DataTypes.STRING(255), allowNull: false, comment: '订阅邮箱（租户内唯一）' },
    status: {
      type: DataTypes.ENUM('subscribed', 'unsubscribed', 'pending'),
      allowNull: false,
      defaultValue: 'subscribed',
      comment: '订阅状态',
    },
    source: { type: DataTypes.STRING(50), allowNull: true, comment: '订阅来源' },
    locale: { type: DataTypes.STRING(10), allowNull: true, comment: '偏好语言' },
    token: { type: DataTypes.STRING(64), allowNull: false, comment: '退订/确认令牌（不可枚举）' },
    subscribedAt: { type: DataTypes.DATE, allowNull: true },
    unsubscribedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'newsletters' },
)

export default ShopNewsletter
