import sequelize from '../../../config/database.js'
import { getTenantContext } from '../context.js'
import { Op } from 'sequelize'

/** 把当前租户约束并入既有 where（原地修改），供 find / bulk update / bulk destroy 复用 */
function injectTenantWhere(options: any) {
  const ctx = getTenantContext()
  if (!ctx || ctx.bypass) return
  if (!options?.model?.rawAttributes?.tenantId) return

  // 注入属性名（而非列名）：由 Sequelize 经 field 映射生成列名，与模型/迁移保持一致
  const constraint = { tenantId: ctx.tenantId ?? -1 }
  options.where = options.where ? { [Op.and]: [options.where, constraint] } : constraint
}

function stampTenantId(instances: any[]) {
  const ctx = getTenantContext()
  if (!ctx || ctx.bypass) return
  for (const instance of instances) {
    if (instance?.constructor?.rawAttributes?.tenantId && instance.tenantId == null) {
      instance.tenantId = ctx.tenantId ?? -1
    }
  }
}

export function registerTenantScope() {
  sequelize.addHook('beforeFind', injectTenantWhere)
  sequelize.addHook('beforeBulkUpdate', injectTenantWhere)
  sequelize.addHook('beforeBulkDestroy', injectTenantWhere)

  sequelize.addHook('beforeCreate', (instance: any) => stampTenantId([instance]))
  sequelize.addHook('beforeBulkCreate', (instances: any[]) => stampTenantId(instances))
}
