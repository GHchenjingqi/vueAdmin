import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 商品评价审核态 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected'

/** 商品评价（C 端公开提交，需审核后展示） */
class ShopReview extends Model<InferAttributes<ShopReview>, InferCreationAttributes<ShopReview>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare spuId: number
  declare skuId: number | null
  declare customerId: number | null
  declare orderId: number | null
  declare rating: number
  declare title: string | null
  declare content: string
  declare images: string[] | null
  declare status: CreationOptional<ReviewStatus>
  declare verified: CreationOptional<boolean>
  declare isAnonymous: CreationOptional<boolean>
  declare helpfulCount: CreationOptional<number>
  declare locale: string | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopReview.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    spuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '评价对象 SPU' },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '可选，SKU 变体' },
    customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '登录顾客，游客评价为空' },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '关联订单（已购验证）' },
    rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, comment: '1-5 星' },
    title: { type: DataTypes.STRING(120), allowNull: true, comment: '评价标题' },
    content: { type: DataTypes.TEXT, allowNull: false, comment: '评价正文' },
    images: { type: DataTypes.JSON, allowNull: true, comment: '图片 URL 列表' },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'pending/approved/rejected',
    },
    verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '已购验证',
    },
    isAnonymous: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, comment: '匿名评价' },
    helpfulCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, comment: '「有用」计数' },
    locale: { type: DataTypes.STRING(10), allowNull: true, comment: '评价语言' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'shop_reviews' },
)

export default ShopReview
