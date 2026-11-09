import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * P5-T01：购物车增加语言快照列。
 *
 * 与 currency（已有）互为独立快照：语言来自 URL/cookie（store_locale），币种来自站点配置，
 * 二者互不推导。记录用户最近一次加购/访问时的语言，仅作展示与续购上下文，不参与报价。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('carts', 'locale', {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: '语言快照（en-US/zh-CN），与币种互不推导',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('carts', 'locale')
}
