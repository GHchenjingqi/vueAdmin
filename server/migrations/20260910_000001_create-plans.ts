import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('plans', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(50), allowNull: false, unique: true, comment: '套餐编码 free/pro/enterprise' },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '套餐名称' },
    priceMonthly: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0, comment: '月付价格' },
    priceYearly: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0, comment: '年付价格' },
    limits: { type: DataTypes.JSON, allowNull: false, comment: '限额 { maxUsers, maxStorageMb, maxApiCallsPerDay, maxWorkflowRunsPerMonth, maxFiles }' },
    features: { type: DataTypes.JSON, allowNull: false, comment: '功能位 map { sso, whiteLabel, openApi, audit, license }' },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '1=上架 0=下架' },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })

  await queryInterface.bulkInsert('plans', [
    { code: 'free', name: '免费版', priceMonthly: 0, priceYearly: 0, limits: JSON.stringify({ maxUsers: 5, maxStorageMb: 100, maxApiCallsPerDay: 100, maxWorkflowRunsPerMonth: 10, maxFiles: 50 }), features: JSON.stringify({}), status: 1, sort: 0, createdAt: new Date(), updatedAt: new Date() },
    { code: 'pro', name: '专业版', priceMonthly: 99, priceYearly: 999, limits: JSON.stringify({ maxUsers: 50, maxStorageMb: 5000, maxApiCallsPerDay: 10000, maxWorkflowRunsPerMonth: 500, maxFiles: 500 }), features: JSON.stringify({ sso: true, openApi: true }), status: 1, sort: 1, createdAt: new Date(), updatedAt: new Date() },
    { code: 'enterprise', name: '企业版', priceMonthly: 999, priceYearly: 9999, limits: JSON.stringify({ maxUsers: 999999, maxStorageMb: 50000, maxApiCallsPerDay: 999999, maxWorkflowRunsPerMonth: 99999, maxFiles: 99999 }), features: JSON.stringify({ sso: true, whiteLabel: true, openApi: true, audit: true, license: true }), status: 1, sort: 2, createdAt: new Date(), updatedAt: new Date() },
  ])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('plans')
}