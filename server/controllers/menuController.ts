/**
 * 菜单管理控制器
 * @module menuController
 */

import { listMenus, getMenuById, createMenu, updateMenu, deleteMenu } from '../services/menuService.js'

/**
 * 获取菜单列表
 * - ?scope=tree 侧边栏树（权限过滤）
 * - ?scope=options 选项树（下拉用）
 */
export const list = async (req, res, next) => {
  try {
    const { scope } = req.query
    const userId = req.user?.id
    const data = await listMenus(scope as string | undefined, userId)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取单个菜单
 */
export const getById = async (req, res, next) => {
  try {
    const menu = await getMenuById(Number(req.params.id))
    res.json({ code: 0, data: menu })
  } catch (err) {
    next(err)
  }
}

/**
 * 创建菜单
 */
export const create = async (req, res, next) => {
  try {
    const result = await createMenu(req.body)
    res.status(201).json({ code: 0, data: { id: result.id }, message: '创建成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 更新菜单
 */
export const update = async (req, res, next) => {
  try {
    await updateMenu(Number(req.params.id), req.body)
    res.json({ code: 0, message: '更新成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 删除菜单
 */
export const remove = async (req, res, next) => {
  try {
    await deleteMenu(Number(req.params.id))
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}