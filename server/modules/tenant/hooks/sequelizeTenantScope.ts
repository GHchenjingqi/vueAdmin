import sequelize from '../../../config/database.js'
import { getTenantContext } from '../context.js'
import { Op } from 'sequelize'

export function registerTenantScope() {
  sequelize.addHook('beforeFind', (options: any) => {
    const ctx = getTenantContext()
    if (!ctx) return
    if (ctx.bypass) return
    const Model = options.model
    if (!Model?.rawAttributes?.tenantId) return

    // 注入属性名（而非列名）：由 Sequelize 经 field 映射生成列名，与模型/迁移保持一致
    const constraint = { tenantId: ctx.tenantId ?? -1 }
    options.where = options.where ? { [Op.and]: [options.where, constraint] } : constraint
  })

  sequelize.addHook('beforeCreate', (instance: any, _options: any) => {
    const ctx = getTenantContext()
    if (!ctx || ctx.bypass) return
    if (instance?.constructor?.rawAttributes?.tenantId && instance.tenantId == null) {
      instance.tenantId = ctx.tenantId ?? -1
    }
  })
}
