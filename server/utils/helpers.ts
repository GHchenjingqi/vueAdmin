/**
 * 通用工具函数
 * @module helpers
 */

/**
 * 统一标准化 ID 数组
 * - 支持传入数组、单个 ID、空值
 * - 始终返回数组或 undefined
 *
 * @param {*} raw - 原始 ID 输入
 * @returns {number[]|undefined} 标准化后的 ID 数组
 *
 * @example
 * normalizeIds([1,2,3])    // => [1,2,3]
 * normalizeIds(1)           // => [1]
 * normalizeIds(undefined)   // => undefined
 */
export function normalizeIds(raw) {
  if (Array.isArray(raw)) return raw
  if (raw !== undefined && raw !== null && raw !== '') {
    return [Number(raw)]
  }
  return undefined
}

/**
 * 通用树构建函数
 * 将平面列表递归构建为嵌套树结构
 *
 * @template T
 * @param {T[]} list - 平面数据列表（需包含 id, parentId 字段）
 * @param {number} [parentId=0] - 父级 ID
 * @param {object} [options] - 配置选项
 * @param {string} [options.sortKey='sort'] - 排序字段名
 * @param {boolean} [options.toJSON=true] - 是否调用 .toJSON()
 * @returns {T[]} 树结构
 */
export function buildTree<T extends { id: number; parentId: number; [key: string]: any }>(
  list: T[],
  parentId = 0,
  options: { sortKey?: string; toJSON?: boolean } = {}
): any[] {
  const { sortKey = 'sort', toJSON = true } = options

  return list
    .filter(item => item.parentId === parentId)
    .sort((a, b) => (a[sortKey] || 0) - (b[sortKey] || 0))
    .map(item => {
      const children = buildTree(list, item.id, options)
      const node = toJSON && typeof item.toJSON === 'function' ? item.toJSON() : { ...item }
      if (children.length > 0) {
        node.children = children
      }
      return node
    })
}

/**
 * 生成变更日志记录（结合 diff + 日志摘要）
 *
 * @param {import('sequelize').Model} model - Sequelize 模型实例
 * @param {object} newData - 新数据
 * @param {string[]} fields - 需要对比的字段列表
 * @returns {{ changes: Array<{field: string, before: *, after: *}>, summary: string }}
 */
export function prepareChangeLog(model, newData, fields) {
  const before = {}
  const after = {}

  for (const field of fields) {
    before[field] = model[field]
    after[field] = newData[field] !== undefined ? newData[field] : model[field]
  }

  const changes = computeDiff(before, after, fields)
  return {
    changes,
    summary: changes.map(c => `${c.field}: ${c.before ?? '-'} → ${c.after ?? '-'}`).join('; '),
  }
}

/**
 * 计算两个对象的差异
 *
 * @param {Object} before - 修改前的数据
 * @param {Object} after - 修改后的数据
 * @param {string[]} fields - 需要对比的字段列表
 * @returns {Array<{field: string, before: *, after: *}>}
 */
function computeDiff(before, after, fields) {
  const changes = []
  for (const field of fields) {
    const oldVal = before[field]
    const newVal = after[field]
    const normalizedOld = oldVal === undefined ? null : oldVal
    const normalizedNew = newVal === undefined ? null : newVal

    if (String(normalizedOld) !== String(normalizedNew)) {
      changes.push({ field, before: normalizedOld, after: normalizedNew })
    }
  }
  return changes
}