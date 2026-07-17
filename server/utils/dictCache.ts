/**
 * 字典数据缓存
 *
 * 缓存字典选项数据（scope=options 场景），避免每次下拉选择都查询数据库。
 * 管理员修改字典后可手动刷新缓存。
 *
 * 缓存结构：
 *   cache[dictType] = [{ label, value, sort }, ...]
 */
import DictData from '../models/DictData.js'
import { logInfo } from './fileLogger.js'

const cache: Record<string, Array<{ label: string; value: string; sort: number }>> = {}

/**
 * 获取缓存的字典选项，缓存未命中时从数据库加载
 * @param dictType - 字典类型标识
 */
export async function getDictOptions(dictType: string) {
  if (!cache[dictType]) {
    await loadDictOptions(dictType)
  }
  return cache[dictType] || []
}

/**
 * 从数据库加载指定字典类型的选项到缓存
 */
export async function loadDictOptions(dictType: string) {
  const items = await DictData.findAll({
    where: { dictType, status: 1 },
    attributes: ['label', 'value', 'sort'],
    order: [['sort', 'ASC'], ['id', 'ASC']],
  })
  cache[dictType] = items.map((item) => ({
    label: item.label,
    value: item.value,
    sort: item.sort,
  }))
}

/**
 * 刷新所有字典缓存（从数据库重新加载）
 * 在字典数据发生变更后调用，保证下拉选项即时更新
 */
export async function refreshAllDictCache() {
  // 清空全部缓存
  const keys = Object.keys(cache)
  for (const key of keys) {
    delete cache[key]
  }
  logInfo(`字典缓存已清空（${keys.length} 个类型），下次查询时将重新加载`)
  return keys.length
}

/**
 * 刷新指定字典类型的缓存
 */
export async function refreshDictCache(dictType: string) {
  delete cache[dictType]
}

/**
 * 获取当前缓存的字典类型列表
 */
export function getCachedDictTypes(): string[] {
  return Object.keys(cache)
}