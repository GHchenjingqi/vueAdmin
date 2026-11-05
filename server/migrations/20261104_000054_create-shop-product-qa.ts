import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 阶段 5 步骤 5（第二切片）：商品问答 shop_product_qa
 * 与 shop 模块共用同一套模型层，不建第二套后端。
 * 提问由 C 端公开接口提交（status=pending），回答由后台/admin 填充（本步仅建表 + 公开读取 answered）。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('shop_product_qa', {
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
  })
  await queryInterface.addIndex('shop_product_qa', ['tenantId', 'spuId', 'status'], {
    name: 'idx_qa_tenant_spu_status',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('shop_product_qa')
}
