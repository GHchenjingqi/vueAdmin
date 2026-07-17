/**
 * 系统设置 Service 层
 *
 * 职责：封装系统设置管理的所有业务逻辑
 */

import Setting from '../models/Setting.js'
import { AppError } from '../middleware/errorHandler.js'
import { refreshSiteInfo, getSiteInfo } from '../utils/siteCache.js'

/**
 * 解析设置值（自动处理 JSON 字符串）
 */
function parseValue(val: string): unknown {
  if (val && (val.startsWith('{') || val.startsWith('['))) {
    try {
      return JSON.parse(val)
    } catch {
      return val
    }
  }
  return val
}

/**
 * 序列化设置值
 */
function serializeValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  return String(value)
}

/**
 * 获取站点公开信息
 */
export function getSitePublicInfo() {
  return getSiteInfo()
}

/**
 * 获取所有设置（分组返回键值对）
 */
export async function listSettings() {
  const settings = await Setting.findAll({ order: [['id', 'ASC']] })
  const map: Record<string, unknown> = {}
  settings.forEach(s => { map[s.optionKey] = parseValue(s.optionValue) })
  return map
}

/**
 * 获取单个设置
 */
export async function getSettingByKey(key: string) {
  const setting = await Setting.findOne({ where: { optionKey: key } })
  if (!setting) throw new AppError(404, '设置项不存在')
  return { key: setting.optionKey, value: parseValue(setting.optionValue) }
}

/**
 * 批量保存设置
 */
export async function saveSettings(settings: Record<string, unknown>) {
  if (!settings || typeof settings !== 'object') {
    throw new AppError(400, '请求体必须为键值对对象')
  }

  const keys = Object.keys(settings)
  for (const key of keys) {
    const value = settings[key]
    if (value === null || value === undefined) continue

    const serialized = serializeValue(value)
    await Setting.upsert({ optionKey: key, optionValue: serialized })
    refreshSiteInfo(key, serialized)
  }

  return { savedCount: keys.length }
}

/**
 * 删除设置项
 */
export async function deleteSetting(key: string) {
  const setting = await Setting.findOne({ where: { optionKey: key } })
  if (!setting) throw new AppError(404, '设置项不存在')

  await setting.destroy()
}