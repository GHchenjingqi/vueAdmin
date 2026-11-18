import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** 提示词分享平台：分类、提示词、效果图、收藏 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('prompt_categories', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '分类名称' },
    description: { type: DataTypes.STRING(255), allowNull: true, comment: '分类描述' },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序，越小越靠前' },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '状态: 1=启用, 0=停用' },
    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  })
  await queryInterface.addIndex('prompt_categories', ['status', 'sort'], { name: 'idx_pc_status_sort' })

  await queryInterface.createTable('prompts', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(200), allowNull: false, comment: '标题' },
    content: { type: DataTypes.TEXT, allowNull: false, comment: '提示词正文' },
    categoryId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '分类 ID' },
    modelName: { type: DataTypes.STRING(100), allowNull: false, comment: '模型名称' },
    status: {
      type: DataTypes.ENUM('draft', 'pending', 'published', 'rejected', 'offline'),
      allowNull: false,
      defaultValue: 'draft',
      comment: '状态: draft/pending/published/rejected/offline',
    },
    source: { type: DataTypes.ENUM('admin', 'user'), allowNull: false, defaultValue: 'admin', comment: '发布来源' },
    authorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '作者用户 ID' },
    rejectReason: { type: DataTypes.STRING(500), allowNull: true, comment: '驳回理由' },
    reviewedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '审核人' },
    reviewedAt: { type: DataTypes.DATE, allowNull: true, comment: '审核时间' },
    viewCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, comment: '浏览次数' },
    isDeleted: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0, comment: '软删除: 1=已删除' },
    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  })
  await queryInterface.addIndex('prompts', ['status', 'isDeleted'], { name: 'idx_prompts_status_deleted' })
  await queryInterface.addIndex('prompts', ['categoryId'], { name: 'idx_prompts_category' })
  await queryInterface.addIndex('prompts', ['authorId'], { name: 'idx_prompts_author' })

  await queryInterface.createTable('prompt_images', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    promptId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '提示词 ID' },
    url: { type: DataTypes.STRING(500), allowNull: false, comment: '访问地址' },
    filePath: { type: DataTypes.STRING(500), allowNull: true, comment: '相对存储路径' },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序，越小越靠前' },
    isCover: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0, comment: '是否封面: 1/0' },
    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  })
  await queryInterface.addIndex('prompt_images', ['promptId', 'sort'], { name: 'idx_pi_prompt_sort' })

  await queryInterface.createTable('prompt_favorites', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '用户 ID' },
    promptId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '提示词 ID' },
    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  })
  await queryInterface.addIndex('prompt_favorites', ['userId', 'promptId'], { name: 'idx_pf_user_prompt', unique: true })

  const now = new Date()
  const names = ['人物', '服装', '环境', '建筑', '产品', '美食', '动物', '插画艺术', '摄影', '其他']
  await queryInterface.bulkInsert(
    'prompt_categories',
    names.map((name, index) => ({ name, description: null, sort: index + 1, status: 1, createdAt: now, updatedAt: now })),
  )
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('prompt_favorites')
  await queryInterface.dropTable('prompt_images')
  await queryInterface.dropTable('prompts')
  await queryInterface.dropTable('prompt_categories')
}
