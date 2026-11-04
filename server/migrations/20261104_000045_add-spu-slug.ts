import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 阶段 5 第 2 步：spus 增加 slug 列
 * - slug 可被后台编辑，作为 C 端 SEO URL 的标识；留空时由前台生成式 slug 兜底
 * - 复合唯一索引 (tenantId, slug)：MySQL 中 NULL 不参与唯一性比较，因此多个空 slug 不冲突
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('spus', 'slug', {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'SEO slug（后台可编辑，留空则由前台生成式 slug 兜底）',
  })
  await queryInterface.addIndex('spus', ['tenantId', 'slug'], {
    name: 'uniq_spus_tenant_slug',
    unique: true,
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('spus', 'uniq_spus_tenant_slug')
  await queryInterface.removeColumn('spus', 'slug')
}
