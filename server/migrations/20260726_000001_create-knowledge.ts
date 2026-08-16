import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('knowledge_categories', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '分类名称',
    },
    parentId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '上级分类 ID',
    },
    sort: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '排序',
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
      comment: '状态: 0=禁用, 1=启用',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  await queryInterface.createTable('knowledge_tags', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '标签名称',
    },
    color: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: '#409EFF',
      comment: '标签颜色',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  await queryInterface.createTable('knowledge_contents', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
      comment: '内容标题',
    },
    summary: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '内容摘要',
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: '正文内容',
    },
    categoryId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '所属分类 ID',
    },
    author: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '',
      comment: '作者',
    },
    status: {
      type: DataTypes.ENUM('draft', 'published'),
      allowNull: false,
      defaultValue: 'draft',
      comment: '状态: draft=草稿, published=已发布',
    },
    publishTime: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '发布时间',
    },
    viewCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '浏览次数',
    },
    cover: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '封面图片 URL',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  await queryInterface.createTable('knowledge_content_tags', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    contentId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '内容 ID',
    },
    tagId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '标签 ID',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  await queryInterface.addIndex('knowledge_content_tags', ['contentId', 'tagId'], {
    unique: true,
    name: 'uq_content_tag',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('knowledge_content_tags')
  await queryInterface.dropTable('knowledge_contents')
  await queryInterface.dropTable('knowledge_tags')
  await queryInterface.dropTable('knowledge_categories')
}