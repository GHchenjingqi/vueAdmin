import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('invoices', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    planId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '套餐ID' },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, comment: '金额' },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'CNY', comment: '币种' },
    periodStart: { type: DataTypes.DATE, allowNull: false, comment: '账期开始' },
    periodEnd: { type: DataTypes.DATE, allowNull: false, comment: '账期结束' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending', comment: 'pending/paid/void' },
    pdfUrl: { type: DataTypes.STRING(255), allowNull: true, comment: '发票 PDF 地址' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('invoices', ['tenantId'])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('invoices')
}