/**
 * 全局搜索控制器
 * @module searchController
 */

import { globalSearch as doSearch } from '../services/searchService.js'

/**
 * 全局搜索（按用户菜单权限过滤）
 * GET /api/search?keyword=xxx
 */
export const globalSearch = async (req, res, next) => {
  try {
    const keyword = req.query.keyword as string
    const data = await doSearch(keyword, req.user.id)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}