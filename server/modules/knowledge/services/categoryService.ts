import { Op } from 'sequelize'
import KnowledgeCategory from '../models/Category.js'
import { AppError } from '../../../middleware/errorHandler.js'

export async function listCategories() {
  const categories = await KnowledgeCategory.findAll({
    order: [['sort', 'ASC'], ['id', 'ASC']],
  })
  return buildTree(categories.map(c => c.toJSON()))
}

export async function listCategoryOptions() {
  const categories = await KnowledgeCategory.findAll({
    where: { status: 1 },
    order: [['sort', 'ASC'], ['id', 'ASC']],
  })
  return buildTree(categories.map(c => c.toJSON()))
}

export async function getCategoryById(id: number) {
  const category = await KnowledgeCategory.findByPk(id)
  if (!category) throw new AppError(404, '分类不存在')
  return category
}

export async function createCategory(data: { name: string; parentId?: number; sort?: number; status?: number }) {
  const category = await KnowledgeCategory.create({
    name: data.name,
    parentId: data.parentId || 0,
    sort: data.sort || 0,
    status: data.status ?? 1,
  })
  return category
}

export async function updateCategory(id: number, data: { name?: string; parentId?: number; sort?: number; status?: number }) {
  const category = await KnowledgeCategory.findByPk(id)
  if (!category) throw new AppError(404, '分类不存在')
  if (data.parentId !== undefined && data.parentId === id) {
    throw new AppError(400, '不能将自身设为上级分类')
  }
  await category.update(data)
  return category
}

export async function deleteCategory(id: number) {
  const category = await KnowledgeCategory.findByPk(id)
  if (!category) throw new AppError(404, '分类不存在')
  const childCount = await KnowledgeCategory.count({ where: { parentId: id } })
  if (childCount > 0) {
    throw new AppError(400, '该分类下有子分类，无法删除')
  }
  await category.destroy()
}

function buildTree(categories: any[]): any[] {
  const map = new Map<number, any>()
  const roots: any[] = []
  categories.forEach(c => map.set(c.id, { ...c, children: [] }))
  categories.forEach(c => {
    const node = map.get(c.id)
    if (c.parentId && map.has(c.parentId)) {
      map.get(c.parentId).children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}