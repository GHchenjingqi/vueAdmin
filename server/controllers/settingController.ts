/**
 * 系统设置控制器
 * @module settingController
 */

import { getSitePublicInfo, listSettings, getSettingByKey, saveSettings, deleteSetting } from '../services/settingService.js'

/**
 * 获取站点公开信息（无需认证）
 */
export const siteInfo = async (req, res, next) => {
  try {
    res.json({ code: 0, data: getSitePublicInfo() })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取所有设置（分组返回键值对）
 */
export const list = async (req, res, next) => {
  try {
    const data = await listSettings()
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取单个设置
 */
export const getByKey = async (req, res, next) => {
  try {
    const data = await getSettingByKey(req.params.key)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * 批量保存设置
 */
export const save = async (req, res, next) => {
  try {
    const result = await saveSettings(req.body)
    res.json({ code: 0, message: `成功保存 ${result.savedCount} 项设置` })
  } catch (err) {
    next(err)
  }
}

/**
 * 删除设置项
 */
export const remove = async (req, res, next) => {
  try {
    await deleteSetting(req.params.key)
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}