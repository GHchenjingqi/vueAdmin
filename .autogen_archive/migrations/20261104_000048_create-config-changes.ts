import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** P0-T05b / P5-T02 / X-T03：币种配置变更审计（谁/何时/从什么改成什么/是否回滚） */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('config_changes', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    key: { type: DataTypes.STRING(100), allowNull: false },
    oldValue: { type: DataTypes.JSON, allowNull: true },
    newValue: { type: DataTypes.JSON, allowNull: true },
    operatorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    operatorName: { type: DataTypes.STRING(64), allowNull: true },
    effectiveAt: { type: DataTypes.DATE, allowNull: true, comment: '定时生效时间（空=立即）' },
    appliedAt: { type: DataTypes.DATE, allowNull: true },
    rollbackOf: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '回滚来源变更 ID' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'applied', comment: 'applied/scheduled/rolled_back' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('config_changes', ['tenantId', 'key'], { name: 'idx_config_changes_key' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('config_changes')
}
