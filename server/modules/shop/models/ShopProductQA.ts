import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 商品问答状态 */
export type ProductQAStatus = 'pending' | 'answered' | 'hidden'

/** 商品问答（C 端提问，商家/后台回答后公开） */
class ShopProductQA extends Model<InferAttributes<ShopProductQA>, InferCreationAttributes<ShopProductQA>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare spuId: number
  declare skuId: number | null
  declare customerId: number | null
  declare question: string
  declare answer: string | null
  declare answeredBy: string | null
  declare answeredAt: Date | null
  declare status: CreationOptional<ProductQAStatus>
  declare locale: string | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopProductQA.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    spuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '问答对象 SPU' },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '可选，SKU 变体' },
    customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '提问顾客，游客提问为空' },
    question: { type: DataTypes.TEXT, allowNull: false, comment: '顾客问题' },
    answer: { type: DataTypes.TEXT, allowNull: true, comment: '官方/商家回答' },
    answeredBy: { type: DataTypes.STRING(64), allowNull: true, comment: '回答者标识' },
    answeredAt: { type: DataTypes.DATE, allowNull: true, comment: '回答时间' },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'pending/answered/hidden',
    },
    locale: { type: DataTypes.STRING(10), allowNull: true, comment: '问题语言' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'shop_product_qa' },
)

export default ShopProductQA
