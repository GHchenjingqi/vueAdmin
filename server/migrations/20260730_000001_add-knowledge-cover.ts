import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('knowledge_contents', 'cover', {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '封面图片 URL',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('knowledge_contents', 'cover')
}