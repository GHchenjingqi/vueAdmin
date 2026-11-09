import type { QueryInterface } from 'sequelize'
import { materializeTenantMenus } from '../modules/tenant/services/menuTemplateService.js'

/**
 * 新库路径下的菜单副本初始化。
 *
 * 迁移 20261109_000002 也会调用同一套逻辑，但新库执行迁移时菜单表还是空的
 * （模板菜单此刻尚未由 20260707_000004 等种子写入），副本无从复制起。
 * 本种子按文件名顺序排在所有菜单种子之后，负责把模板复制给各租户。
 */
export async function up(_queryInterface: QueryInterface): Promise<void> {
  await materializeTenantMenus()
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('DELETE FROM menus WHERE tenantId > 0')
}
