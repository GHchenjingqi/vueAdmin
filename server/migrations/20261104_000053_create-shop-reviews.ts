import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 阶段 5 步骤 5（第二切片）：商品评价 shop_reviews
 * 与 shop 模块共用同一套模型层，不建第二套后端。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('shop_reviews', {
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
      comment: '已购验证（传 orderId 且校验通过）',
    },
    isAnonymous: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, comment: '匿名评价' },
    helpfulCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, comment: '「有用」计数' },
    locale: { type: DataTypes.STRING(10), allowNull: true, comment: '评价语言' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('shop_reviews', ['tenantId', 'spuId', 'status'], {
    name: 'idx_reviews_tenant_spu_status',
  })
  await queryInterface.addIndex('shop_reviews', ['tenantId', 'status'], { name: 'idx_reviews_tenant_status' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('shop_reviews')
}
