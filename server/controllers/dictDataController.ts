/**
 * 字典数据管理控制器
 * @module dictDataController
 */

import { listDictData, getDictDataById, createDictData, updateDictData, deleteDictData, getDictDataOptions } from '../services/dictDataService.js'

/**
 * 获取字典数据列表
 * - ?scope=options&type=xxx 获取选项
 */
export const list = async (req, res, next) => {
  try {
    const data = await listDictData(req.query as Record<string, unknown> as {
      scope?: string; type?: string; page?: number; pageSize?: number; dictType?: string; keyword?: string
    })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取单个字典数据
 */
export const getById = async (req, res, next) => {
  try {
    const item = await getDictDataById(Number(req.params.id))
    res.json({ code: 0, data: item })
  } catch (err) {
    next(err)
  }
}

/**
 * 创建字典数据
 */
export const create = async (req, res, next) => {
  try {
    const result = await createDictData(req.body)
    res.status(201).json({ code: 0, data: { id: result.id }, message: '创建成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 更新字典数据
 */
export const update = async (req, res, next) => {
  try {
    await updateDictData(Number(req.params.id), req.body)
    res.json({ code: 0, message: '更新成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 删除字典数据
 */
export const remove = async (req, res, next) => {
  try {
    await deleteDictData(Number(req.params.id))
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}

/** 获取字典数据选项（用于下拉选择器） */
export const options = async (req, res, next) => {
  try {
    const dictType = req.query.type as string
    const data = await getDictDataOptions(dictType)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}