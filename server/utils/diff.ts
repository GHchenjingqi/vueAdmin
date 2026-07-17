/**
 * 计算两个对象的差异，返回适合前端展示的 diff 格式
 * @param {Object} before - 修改前的数据
 * @param {Object} after - 修改后的数据
 * @param {string[]} fields - 需要对比的字段列表
 * @returns {Array<{field: string, before: *, after: *}>}
 */
export function computeDiff(before, after, fields) {
  const changes = []
  for (const field of fields) {
    const oldVal = before[field]
    const newVal = after[field]
    // 将 null / undefined 统一转为 null 进行比较
    const normalizedOld = oldVal === undefined ? null : oldVal
    const normalizedNew = newVal === undefined ? null : newVal

    if (String(normalizedOld) !== String(normalizedNew)) {
      changes.push({
        field,
        before: normalizedOld,
        after: normalizedNew,
      })
    }
  }
  return changes
}