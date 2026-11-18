import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

const DEFAULT_PLATFORMS = ['通用', '即梦', '可灵', 'GPT', 'Midjourney', 'Stable Diffusion', '通义万相']

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('prompt_platforms', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '平台名称' },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序，越小越靠前' },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '状态: 1=启用, 0=停用' },
    builtin: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0, comment: '是否内置平台: 1/0' },
    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  })
  await queryInterface.addIndex('prompt_platforms', ['status', 'sort'], { name: 'idx_pp_status_sort' })

  await queryInterface.addColumn('prompt_images', 'platformId', {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    defaultValue: 1,
    comment: '平台字典 ID',
  })
  await queryInterface.addIndex('prompt_images', ['platformId'], { name: 'idx_pi_platform' })

  const now = new Date()
  await queryInterface.bulkInsert(
    'prompt_platforms',
    DEFAULT_PLATFORMS.map((name, index) => ({
      name,
      sort: index,
      status: 1,
      builtin: name === '通用' ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })),
  )
  await queryInterface.sequelize.query('UPDATE prompt_images SET platformId = 1 WHERE platformId IS NULL')
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('prompt_images', 'idx_pi_platform')
  await queryInterface.removeColumn('prompt_images', 'platformId')
  await queryInterface.dropTable('prompt_platforms')
}
