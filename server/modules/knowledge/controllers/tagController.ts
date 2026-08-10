import {
  listTags,
  listTagOptions,
  getTagById,
  createTag,
  updateTag,
  deleteTag,
} from '../services/tagService.js'

export async function list(req: any, res: any, next: any) {
  try {
    const page = Number(req.query.page) || 1
    const pageSize = Number(req.query.pageSize) || 10
    const keyword = req.query.keyword as string | undefined
    const data = await listTags(page, pageSize, keyword)
    res.json({ code: 0, data: { rows: data.rows, total: data.total } })
  } catch (err) {
    next(err)
  }
}

export async function options(req: any, res: any, next: any) {
  try {
    const data = await listTagOptions()
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export async function getById(req: any, res: any, next: any) {
  try {
    const data = await getTagById(Number(req.params.id))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export async function create(req: any, res: any, next: any) {
  try {
    const data = await createTag(req.body)
    res.status(201).json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export async function update(req: any, res: any, next: any) {
  try {
    const data = await updateTag(Number(req.params.id), req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export async function remove(req: any, res: any, next: any) {
  try {
    await deleteTag(Number(req.params.id))
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}