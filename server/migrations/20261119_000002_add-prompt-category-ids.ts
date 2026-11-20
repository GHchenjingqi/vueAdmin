import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** 提示词分类多选：新增 categoryIds 列表字段，categoryId 保留为首项（主分类）以兼容既有逻辑 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('prompts', 'categoryIds', {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '所属分类 ID 列表，首项为主分类并与 categoryId 保持一致',
  })
  await queryInterface.sequelize.query('UPDATE prompts SET categoryIds = JSON_ARRAY(categoryId) WHERE categoryIds IS NULL')
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('prompts', 'categoryIds')
}
