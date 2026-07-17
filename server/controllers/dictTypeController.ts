/**
 * 字典类型管理控制器
 * @module dictTypeController
 */

import { listDictTypes, getDictTypeById, createDictType, updateDictType, deleteDictType, getAllActiveDictTypes, refreshDictCache } from '../services/dictTypeService.js'

/**
 * 获取字典类型列表
 * - ?scope=all 获取所有启用类型
 */
export const list = async (req, res, next) => {
  try {
    const data = await listDictTypes(req.query as Record<string, unknown> as { scope?: string; page?: number; pageSize?: number; keyword?: string })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取单个字典类型
 */
export const getById = async (req, res, next) => {
  try {
    const dictType = await getDictTypeById(Number(req.params.id))
    res.json({ code: 0, data: dictType })
  } catch (err) {
    next(err)
  }
}

/**
 * 创建字典类型
 */
export const create = async (req, res, next) => {
  try {
    const result = await createDictType(req.body)
    res.status(201).json({ code: 0, data: { id: result.id }, message: '创建成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 更新字典类型
 */
export const update = async (req, res, next) => {
  try {
    await updateDictType(Number(req.params.id), req.body)
    res.json({ code: 0, message: '更新成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 删除字典类型（级联删除该类型下的所有字典数据）
 */
export const remove = async (req, res, next) => {
  try {
    await deleteDictType(Number(req.params.id))
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}

/** 获取所有启用字典类型（用于下拉选择器） */
export const all = async (req, res, next) => {
  try {
    const data = await getAllActiveDictTypes()
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * 刷新字典缓存
 */
export const refreshCache = async (req, res, next) => {
  try {
    const count = await refreshDictCache()
    res.json({ code: 0, message: `字典缓存已刷新，共清除 ${count} 个类型的缓存` })
  } catch (err) {
    next(err)
  }
}