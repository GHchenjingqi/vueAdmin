import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { ShopCategory } from '../models/index.js'
import type { CreateCategoryInput, UpdateCategoryInput } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface CategoryTreeItem {
  id: number
  parentId: number
  name: Record<string, string>
  level: number
  sort: number
  children: CategoryTreeItem[]
}

function buildTree(items: ShopCategory[]): CategoryTreeItem[] {
  const nodes = new Map<number, CategoryTreeItem>()
  for (const item of items) {
    nodes.set(item.id, {
      id: item.id,
      parentId: item.parentId,
      name: item.name,
      level: item.level,
      sort: item.sort,
      children: [],
    })
  }
  const roots: CategoryTreeItem[] = []
  for (const node of nodes.values()) {
    const parent = nodes.get(node.parentId)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/** 类目树（全量，前端懒展开） */
export async function getCategoryTree(): Promise<CategoryTreeItem[]> {
  const rows = await ShopCategory.findAll({ where: { tenantId: tid() }, order: [['sort', 'ASC'], ['id', 'ASC']] })
  return buildTree(rows)
}

export async function getCategoryById(id: number): Promise<ShopCategory> {
  const row = await ShopCategory.findOne({ where: { id, tenantId: tid() } })
  if (!row) throw new AppError(404, '类目不存在')
  return row
}

export async function createCategory(input: CreateCategoryInput): Promise<ShopCategory> {
  if (input.parentId > 0) {
    const parent = await getCategoryById(input.parentId)
    // 子类目层级 = 父层级 + 1，最大 5 级
    input.level = Math.min(parent.level + 1, 5)
  }
  return ShopCategory.create({ ...input, tenantId: getTenantContext()?.tenantId ?? 1 } as never)
}

export async function updateCategory(id: number, input: UpdateCategoryInput): Promise<ShopCategory> {
  const row = await getCategoryById(id)
  if (input.parentId != null) {
    if (input.parentId === id) throw new AppError(400, '父类目不能是自身')
    // 禁止把类目挂到自己的子孙节点下（成环）
    if (input.parentId > 0) {
      const descendants: number[] = []
      const collect = async (pid: number): Promise<void> => {
        const children = await ShopCategory.findAll({ where: { parentId: pid, tenantId: tid() }, attributes: ['id'] })
        for (const c of children) {
          descendants.push(c.id)
          await collect(c.id)
        }
      }
      await collect(id)
      if (descendants.includes(input.parentId)) throw new AppError(400, '父类目不能是自身的子孙类目')
    }
  }
  await row.update(input as never)
  return row
}

export async function deleteCategory(id: number): Promise<void> {
  const row = await getCategoryById(id)
  const hasChildren = await ShopCategory.count({ where: { parentId: id, tenantId: tid() } })
  if (hasChildren > 0) throw new AppError(400, '存在子类目，无法删除')
  await row.destroy()
}

/** 类目选项（下拉用，取名称的 zh-CN 或首个语言） */
export async function getCategoryOptions(): Promise<Array<{ id: number; name: string; parentId: number }>> {
  const rows = await ShopCategory.findAll({ where: { tenantId: tid() }, order: [['sort', 'ASC'], ['id', 'ASC']], attributes: ['id', 'parentId', 'name'] })
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parentId,
    name: (r.name as Record<string, string>)['zh-CN'] || Object.values(r.name as Record<string, string>)[0] || `#${r.id}`,
  }))
}

/** 关键字过滤（多语言 name 任一语言命中） */
export async function searchCategories(keyword: string): Promise<CategoryTreeItem[]> {
  const rows = await ShopCategory.findAll({
    where: { name: { [Op.like]: `%${keyword}%` }, tenantId: tid() } as never,
    order: [['sort', 'ASC'], ['id', 'ASC']],
  })
  return buildTree(rows)
}
