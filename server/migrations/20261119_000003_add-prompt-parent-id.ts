import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** 关联提示词：parentId 指向派生自的提示词，支持多层级追问链 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('prompts', 'parentId', {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: '派生自的提示词 ID；顶层提示词为 NULL',
  })
  await queryInterface.addIndex('prompts', ['parentId'], { name: 'idx_prompt_parent' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('prompts', 'idx_prompt_parent')
  await queryInterface.removeColumn('prompts', 'parentId')
}
