import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** 为 workflow_edges 增加来源 handle（条件节点真/假分支） */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('workflow_edges', 'sourceHandle', {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: '源节点出口 handle（条件节点：true / false）',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('workflow_edges', 'sourceHandle')
}
