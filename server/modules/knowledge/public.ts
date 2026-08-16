import { Op } from 'sequelize'
import KnowledgeContent from './models/Content.js'
import KnowledgeCategory from './models/Category.js'
import KnowledgeTag from './models/Tag.js'
import KnowledgeContentTag from './models/ContentTag.js'
import { renderMarkdown } from '../../public/index.js'
import type { PublicModule, NavItem, HomeWidget, SitemapEntry, FeedEntry, PublicRouteContext } from '../../public/types.js'

const PAGE_SIZE = 9

/** 对外 DTO：裁剪掉内部字段，只暴露公开所需信息 */
function toPublicDTO(row: any, base: string) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary || '',
    cover: row.cover || null,
    author: row.author || '',
    categoryId: row.categoryId || null,
    categoryName: row.categoryName || null,
    publishTime: row.publishTime ? new Date(row.publishTime).toISOString() : null,
    viewCount: row.viewCount || 0,
    url: `${base}/knowledge/${row.id}`,
  }
}

/** 公开列表查询：只查已发布，按发布时间倒序 */
async function listPublished(base: string, page: number, pageSize: number, filters: { keyword?: string; categoryId?: number; tagId?: number }) {
  const where: any = { status: 'published', publishTime: { [Op.lte]: new Date() } }
  if (filters.keyword) {
    where[Op.or] = [{ title: { [Op.like]: `%${filters.keyword}%` } }, { summary: { [Op.like]: `%${filters.keyword}%` } }]
  }
  if (filters.categoryId) where.categoryId = filters.categoryId
  const offset = (page - 1) * pageSize
  let contentIds: number[] | undefined
  if (filters.tagId) {
    const links = await KnowledgeContentTag.findAll({ where: { tagId: filters.tagId }, attributes: ['contentId'] })
    contentIds = links.map((r: any) => r.contentId)
    if (contentIds.length === 0) return { rows: [], total: 0 }
    where.id = { [Op.in]: contentIds }
  }

  const { rows, count } = await KnowledgeContent.findAndCountAll({
    where,
    order: [['publishTime', 'DESC']],
    offset,
    limit: pageSize,
  })
  const items = rows.map((r: any) => toPublicDTO(r, base))
  return { rows: items, total: count }
}

async function getPublishedById(id: number) {
  const row: any = await KnowledgeContent.findByPk(id)
  if (!row || row.status !== 'published') return null
  const item: any = row.toJSON()
  if (item.categoryId) {
    const cat = await KnowledgeCategory.findByPk(item.categoryId, { attributes: ['name'] })
    item.categoryName = cat?.get('name') || null
  }
  const tagLinks = await KnowledgeContentTag.findAll({ where: { contentId: item.id }, attributes: ['tagId'] })
  item.tags = tagLinks.length ? (await KnowledgeTag.findAll({ where: { id: { [Op.in]: tagLinks.map((t: any) => t.tagId) } } })).map((t: any) => t.toJSON()) : []
  return item
}

/** 分页 HTML */
function paginationHtml(base: string, page: number, total: number, pageSize: number): string {
  const pages = Math.ceil(total / pageSize) || 1
  if (pages <= 1) return ''
  const link = (p: number) => `${base}/knowledge?page=${p}`
  const items: string[] = []
  for (let p = 1; p <= pages; p++) {
    items.push(p === page ? `<span class="is-active">${p}</span>` : `<a href="${link(p)}">${p}</a>`)
  }
  return `<div class="pagination">${items.join('')}</div>`
}

/** 知识库对外模块 */
export const knowledgePublicModule: PublicModule = {
  name: 'knowledge',

  nav: (base: string): NavItem[] => [{ title: '知识库', url: `${base}/knowledge` }],

  homeWidgets: async (base: string): Promise<HomeWidget[]> => {
    const { rows } = await listPublished(base, 1, 6, {})
    return [{ key: 'latest-posts', title: '最新文章', view: 'widgets/latest-posts', data: { items: rows } }]
  },

  registerRoutes: (ctx: PublicRouteContext) => {
    const { router, base, render } = ctx

    // 列表页（EJS）
    router.get('/knowledge', async (req, res, next) => {
      try {
        const page = Math.max(1, Number(req.query.page) || 1)
        const { rows, total } = await listPublished(base, page, PAGE_SIZE, {
          keyword: req.query.keyword ? String(req.query.keyword) : undefined,
          categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined,
          tagId: req.query.tagId ? Number(req.query.tagId) : undefined,
        })
        render(res, 'post-list', { pageTitle: '知识库', items: rows, paginationHtml: paginationHtml(base, page, total, PAGE_SIZE) }, { description: '知识库文章列表' })
      } catch (err) {
        next(err)
      }
    })

    // 详情页（EJS）
    router.get('/knowledge/:id', async (req, res, next) => {
      try {
        const id = Number(req.params.id)
        const post = await getPublishedById(id)
        if (!post) return render(res, 'error', { code: 404, message: '文章不存在或未发布' }, { title: '404' })
        // 浏览量 +1（非阻塞）
        KnowledgeContent.increment('viewCount', { where: { id } }).catch(() => {})
        const [prev, next] = await Promise.all([
          KnowledgeContent.findOne({
            where: { status: 'published', id: { [Op.lt]: id }, publishTime: { [Op.lte]: new Date() } },
            order: [['id', 'DESC']],
            attributes: ['id', 'title'],
          }),
          KnowledgeContent.findOne({
            where: { status: 'published', id: { [Op.gt]: id }, publishTime: { [Op.lte]: new Date() } },
            order: [['id', 'ASC']],
            attributes: ['id', 'title'],
          }),
        ])
        render(
          res,
          'post-detail',
          {
            pageTitle: post.title,
            post,
            postBodyHtml: ctx.renderMarkdown(post.body),
            category: post.categoryName ? { name: post.categoryName } : null,
            prev: prev ? { url: `${base}/knowledge/${prev.get('id')}`, title: prev.get('title') } : null,
            next: next ? { url: `${base}/knowledge/${next.get('id')}`, title: next.get('title') } : null,
          },
          { title: post.title, description: post.summary, ogImage: post.cover || undefined },
        )
      } catch (err) {
        next(err)
      }
    })

    // 只读 JSON 接口
    router.get('/api/knowledge/contents', async (req, res, next) => {
      try {
        const page = Math.max(1, Number(req.query.page) || 1)
        const pageSize = Number(req.query.pageSize) || 10
        const { rows, total } = await listPublished(base, page, pageSize, {
          keyword: req.query.keyword ? String(req.query.keyword) : undefined,
          categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined,
          tagId: req.query.tagId ? Number(req.query.tagId) : undefined,
        })
        res.json({ code: 0, data: { rows, total, page, pageSize } })
      } catch (err) {
        next(err)
      }
    })

    router.get('/api/knowledge/contents/:id', async (req, res, next) => {
      try {
        const post = await getPublishedById(Number(req.params.id))
        if (!post) return res.status(404).json({ code: 404, message: '文章不存在或未发布' })
        res.json({ code: 0, data: toPublicDTO(post, base) })
      } catch (err) {
        next(err)
      }
    })
  },

  sitemap: async (base: string): Promise<SitemapEntry[]> => {
    const rows: any[] = await KnowledgeContent.findAll({
      where: { status: 'published', publishTime: { [Op.lte]: new Date() } },
      attributes: ['id', 'publishTime'],
      order: [['publishTime', 'DESC']],
    })
    const entries: SitemapEntry[] = rows.map((r) => ({
      url: `${base}/knowledge/${r.id}`,
      updatedAt: r.publishTime ? new Date(r.publishTime).toISOString().slice(0, 10) : undefined,
      priority: 0.7,
    }))
    entries.unshift({ url: `${base}/knowledge`, priority: 0.8 })
    return entries
  },

  feed: async (base: string): Promise<FeedEntry[]> => {
    const { rows } = await listPublished(base, 1, 20, {})
    return rows.map((r: any) => ({ title: r.title, url: r.url, description: r.summary, publishTime: r.publishTime }))
  },
}
