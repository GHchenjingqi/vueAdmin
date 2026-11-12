/**
 * 搜索同义词 / 别名归一化服务（搜索增强二期）
 *
 * 纯函数、零新表、零外部依赖：用代码常量别名表做「整词精确归一化」。
 * 设计取舍（防污染检索结果）：
 * - 只做**整词**匹配，不做模糊 / 子串展开（避免 "lace" 误展开到无关词）；
 * - 每个同义组选一个 canonical 代表词，热词统计时把别名归并到代表词；
 * - expandTerm 返回该词所在组的全部别名（含自身），供 keyword OR 检索展开。
 *
 * 运营可通过 settings 表 `search.synonyms` 覆盖 / 追加（后续接入，当前用内置表）。
 */

/** 同义组：每组第一个词为 canonical 代表词 */
export const SYNONYM_GROUPS: string[][] = [
  // 假发品类核心别名（英文站主词，大小写归一小写）
  ['wig', 'hairpiece', 'hair piece'],
  ['lace front', 'lace front wig', 'frontal wig'],
  ['lace closure', 'closure wig', 'closure'],
  ['full lace', 'full lace wig'],
  ['hd lace', 'hd lace wig', 'invisible lace'],
  ['transparent lace', 'transparent lace wig', 'clear lace'],
  ['glueless', 'glueless wig', 'glue-less', 'no glue'],
  // 发型纹理
  ['body wave', 'bodywave', 'body wavy'],
  ['deep wave', 'deepwave', 'deep wavy'],
  ['water wave', 'waterwave', 'water wavy'],
  ['straight', 'silky straight', 'yaki straight'],
  ['curly', 'curly wig', 'kinky curly'],
  ['bob', 'bob wig', 'bob cut'],
  // 人发 / 材质
  ['human hair', '100% human hair', 'remy hair', 'virgin hair'],
  ['synthetic', 'synthetic wig', 'fibre'],
  // 长度单位混用
  ['inch', '"', 'in'],
]

/** 预处理：小写 + 去首尾空白 + 折叠内部多空格 */
function normalize(word: string): string {
  return String(word ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

// 预构建索引：别名（归一化）→ 组下标
const aliasIndex = new Map<string, number>()
for (let g = 0; g < SYNONYM_GROUPS.length; g++) {
  for (const alias of SYNONYM_GROUPS[g]) {
    aliasIndex.set(normalize(alias), g)
  }
}

/** canonical 代表词：别名归一到组首词；未收录则返回归一化后的自身 */
export function canonicalTerm(term: string): string {
  const t = normalize(term)
  if (!t) return ''
  const g = aliasIndex.get(t)
  return g === undefined ? t : normalize(SYNONYM_GROUPS[g][0])
}

/** 展开词为该组全部别名（含 canonical）；未收录则返回 [归一化词]。用于 keyword OR 检索。 */
export function expandTerm(term: string): string[] {
  const t = normalize(term)
  if (!t) return []
  const g = aliasIndex.get(t)
  if (g === undefined) return [t]
  return SYNONYM_GROUPS[g].map((a) => normalize(a))
}

/** 批量归并热词：把别名归并到 canonical，返回 Map<canonical, count>（不排序） */
export function mergeByCanonical(counts: Iterable<[string, number]>): Map<string, number> {
  const merged = new Map<string, number>()
  for (const [term, count] of counts) {
    const key = canonicalTerm(term)
    if (!key) continue
    merged.set(key, (merged.get(key) ?? 0) + count)
  }
  return merged
}
