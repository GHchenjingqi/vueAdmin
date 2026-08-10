import {
  listContents,
  getContentById,
  createContent,
  updateContent,
  deleteContent,
} from '../services/contentService.js'

export async function list(req: any, res: any, next: any) {
  try {
    const page = Number(req.query.page) || 1
    const pageSize = Number(req.query.pageSize) || 10
    const filters = {
      keyword: req.query.keyword as string | undefined,
      categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined,
      tagId: req.query.tagId ? Number(req.query.tagId) : undefined,
      status: req.query.status as string | undefined,
    }
    const data = await listContents(page, pageSize, filters)
    res.json({ code: 0, data: { rows: data.rows, total: data.total } })
  } catch (err) {
    next(err)
  }
}

export async function getById(req: any, res: any, next: any) {
  try {
    const data = await getContentById(Number(req.params.id))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export async function create(req: any, res: any, next: any) {
  try {
    const data = await createContent({
      ...req.body,
      author: req.user?.nickname || req.user?.username || '',
    })
    res.status(201).json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export async function update(req: any, res: any, next: any) {
  try {
    const data = await updateContent(Number(req.params.id), req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export async function remove(req: any, res: any, next: any) {
  try {
    await deleteContent(Number(req.params.id))
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}