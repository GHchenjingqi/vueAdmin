import {
  listCategories,
  listCategoryOptions,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../services/categoryService.js'

export async function list(req: any, res: any, next: any) {
  try {
    const data = await listCategories()
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export async function options(req: any, res: any, next: any) {
  try {
    const data = await listCategoryOptions()
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export async function getById(req: any, res: any, next: any) {
  try {
    const data = await getCategoryById(Number(req.params.id))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export async function create(req: any, res: any, next: any) {
  try {
    const data = await createCategory(req.body)
    res.status(201).json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export async function update(req: any, res: any, next: any) {
  try {
    const data = await updateCategory(Number(req.params.id), req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export async function remove(req: any, res: any, next: any) {
  try {
    await deleteCategory(Number(req.params.id))
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}