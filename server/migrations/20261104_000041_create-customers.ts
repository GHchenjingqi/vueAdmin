import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** P0-T10 / P4-T01/T02：C 端顾客与地址簿（与 admin users 完全隔离） */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('customers', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    email: { type: DataTypes.STRING(255), allowNull: false, comment: '登录邮箱' },
    passwordHash: { type: DataTypes.STRING(100), allowNull: false },
    nickname: { type: DataTypes.STRING(64), allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active', comment: 'active/blocked' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('customers', ['tenantId', 'email'], { unique: true, name: 'uq_customers_tenant_email' })

  await queryInterface.createTable('customer_addresses', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    fullName: { type: DataTypes.STRING(120), allowNull: false },
    phone: { type: DataTypes.STRING(32), allowNull: false },
    country: { type: DataTypes.STRING(2), allowNull: false, comment: 'ISO 3166-1 alpha-2' },
    province: { type: DataTypes.STRING(64), allowNull: false },
    city: { type: DataTypes.STRING(64), allowNull: false },
    address1: { type: DataTypes.STRING(255), allowNull: false },
    address2: { type: DataTypes.STRING(255), allowNull: true },
    postcode: { type: DataTypes.STRING(20), allowNull: false },
    isDefault: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('customer_addresses', ['tenantId', 'customerId'], { name: 'idx_caddr_tenant_customer' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('customer_addresses')
  await queryInterface.dropTable('customers')
}
