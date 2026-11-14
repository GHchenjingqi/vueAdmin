import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * SKU 成本与物流属性（PLAN 3.3 / 3.4）
 *
 * 两个缺口合并成一个迁移，因为都改同一张表、同属"让利润与运费可算"的前提：
 *
 * 1. 成本口径（3.3）：利润报表此前把 `declaredValue`（报关申报价值）当采购成本，
 *    既不是真实毛利，又让报关数据承担财务职责。新增 `costAmount` 专用于成本，
 *    `declaredValue` 只保留报关语义。
 * 2. 物流属性（3.4）：`sku` 表没有重量/尺寸，运费只能按国家固定价，
 *    无法按重计费，也无法与货代账单对账。新增 `weightGram` 与三边毫米。
 *
 * 幂等：逐列探测后再添加，重复执行安全；down 反向移除。
 */
const TABLE = 'skus'

type ColumnSpec = { name: string; definition: Record<string, unknown> }

const COLUMNS: ColumnSpec[] = [
  {
    name: 'costAmount',
    definition: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      comment: '采购成本（与报关申报价值分离，用于利润报表）',
    },
  },
  {
    name: 'weightGram',
    definition: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '单件实重（克），运费按重计费',
    },
  },
  { name: 'lengthMm', definition: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '包装长（毫米）' } },
  { name: 'widthMm', definition: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '包装宽（毫米）' } },
  { name: 'heightMm', definition: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '包装高（毫米）' } },
]

export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (!tables.includes(TABLE)) return

  const desc = (await queryInterface.describeTable(TABLE)) as Record<string, unknown>
  for (const col of COLUMNS) {
    if (desc[col.name]) continue
    await queryInterface.addColumn(TABLE, col.name, col.definition as never)
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (!tables.includes(TABLE)) return
  const desc = (await queryInterface.describeTable(TABLE)) as Record<string, unknown>
  for (const col of COLUMNS) {
    if (!desc[col.name]) continue
    await queryInterface.removeColumn(TABLE, col.name)
  }
}
