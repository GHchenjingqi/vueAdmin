import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/**
 * 收藏夹（C 端顾客）。按 SPU/productId 收藏（前台商品卡即 SPU 单位），
 * uq(tenantId, customerId, productId) 幂等。notifyOnSale 控制降价是否邮件提醒。
 */
class ShopWishlist extends Model<InferAttributes<ShopWishlist>, InferCreationAttributes<ShopWishlist>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare siteId: number | null
  declare customerId: number
  declare productId: number
  declare notifyOnSale: CreationOptional<boolean>
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopWishlist.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    siteId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '站点ID（shops.id）' },
    customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '顾客ID（customers.id）' },
    productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '商品ID（spus.id）' },
    notifyOnSale: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: '降价时是否邮件提醒',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'shop_wishlists',
    indexes: [
      { name: 'uq_wishlists_tenant_customer_product', unique: true, fields: ['tenantId', 'customerId', 'productId'] },
      { name: 'idx_wishlists_tenant_product', fields: ['tenantId', 'productId'] },
    ],
  },
)

export default ShopWishlist
