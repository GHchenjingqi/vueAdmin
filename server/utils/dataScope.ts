/**
 * 数据权限（行级 / 部门数据隔离）工具
 *
 * 与角色 dataScope 字段配合：
 *   1 = 全部数据
 *   2 = 仅本部门
 *   3 = 本级及以下部门
 *
 * 解析后的结果用于用户管理等列表/导出/详情查询的 WHERE 条件约束，
 * 使「部门主管」角色只能看到自己部门（或下级部门）的数据。
 */
import { Op } from 'sequelize'
import Department from '../models/Department.js'
import Role from '../models/Role.js'
import { createCache } from './cache.js'

export interface ResolvedScope {
  /** 1=全部 2=本部门 3=本级及以下 */
  dataScope: number
  /** 当前用户所属部门 ID */
  deptId: number
  /** 解析后可访问的部门 ID 列表（dataScope=1 时为空，表示不限制） */
  deptIds: number[]
}

/**
 * 根据用户所属角色解析有效数据范围。
 * - 多角色取「最宽松」范围（min），若任一角色为 1=全部 则整体为全部；
 * - 无角色时回退为仅本部门（基于用户自身 deptId）。
 */
export async function resolveDataScope(userDeptId: number | null, roleIds: number[]): Promise<ResolvedScope> {
  const deptId = userDeptId ?? 0

  if (!roleIds || roleIds.length === 0) {
    return {
      dataScope: deptId ? 2 : 1,
      deptId,
      deptIds: deptId ? [deptId] : [],
    }
  }

  const roles = await (Role as any).findAll({ where: { id: { [Op.in]: roleIds } }, attributes: ['dataScope'] })
  const scopes = roles.map((r) => (r as unknown as { dataScope: number }).dataScope ?? 1)
  const dataScope = scopes.length > 0 ? Math.min(...scopes) : 1

  if (dataScope === 1) {
    return { dataScope: 1, deptId, deptIds: [] }
  }

  if (!deptId) {
    return { dataScope, deptId: 0, deptIds: [] }
  }

  const deptIds = dataScope === 3 ? await getDescendantDeptIds(deptId) : [deptId]
  return { dataScope, deptId, deptIds }
}

/**
 * 获取以 rootId 为根的整棵部门子树（含自身）的 ID 列表。
 * 部门为 parentId 自关联树，全部加载后在内存中 BFS 计算，数据量小、足够高效。
 */
export async function getDescendantDeptIds(rootId: number): Promise<number[]> {
  const all = await Department.findAll({ attributes: ['id', 'parentId'] })
  const childrenOf: Record<number, number[]> = {}
  for (const d of all) {
    const pid = (d as unknown as { parentId: number }).parentId
    if (!childrenOf[pid]) childrenOf[pid] = []
    childrenOf[pid].push((d as unknown as { id: number }).id)
  }

  const result: number[] = [rootId]
  const stack = [rootId]
  while (stack.length) {
    const cur = stack.pop() as number
    for (const child of childrenOf[cur] || []) {
      result.push(child)
      stack.push(child)
    }
  }
  return result
}

/**
 * dataScope=3 的子树解析结果按部门缓存 60s：
 * JWT 载荷只携带 deptId/dataScope（不放数组），否则部门树一变就要全员重登；
 * 部门结构变更处显式失效，保证调整后立即可见。
 */
const deptScopeCache = createCache<number[]>({ namespace: 'dept-scope', maxAgeMs: 60_000, max: 1000 })

/** 以 deptId 为根的可见部门集合（含自身），带缓存 */
export async function getAccessibleDeptIds(deptId: number): Promise<number[]> {
  return deptScopeCache.getOrSet(`d:${deptId}`, async () => getDescendantDeptIds(deptId))
}

/** 部门结构（增删改、改父级）变更后失效全部子树缓存 */
export async function invalidateDeptScope(): Promise<void> {
  await deptScopeCache.clear()
}

/**
 * 是否需要补齐子树：只有 dataScope=3 且尚未解析过才需要查库，
 * 其余请求保持同步放行（认证中间件对无需解析的请求不得引入异步）。
 */
export function needsScopeHydration(user?: { dataScope?: number; deptId?: number; deptIds?: number[] }): boolean {
  return user?.dataScope === 3 && !!user.deptId && !(user.deptIds && user.deptIds.length > 0)
}

/**
 * 把请求用户的可见部门集合补齐到 req.user 上。
 * 仅 dataScope=3 需要查库；解析失败时保持为空，
 * 使 applyDataScopeWhere 退化为「仅本部门」而非放开为「全部」——宁可少看，不可多看。
 */
export async function hydrateRequestScope(user?: { dataScope?: number; deptId?: number; deptIds?: number[] }): Promise<void> {
  if (!needsScopeHydration(user)) return
  try {
    user!.deptIds = await getAccessibleDeptIds(user!.deptId!)
  } catch (err) {
    console.warn('[dataScope] 子树解析失败，按仅本部门处理:', err)
  }
}

/**
 * 将部门数据范围约束合并进查询 WHERE 条件。
 *
 * 规则：
 * - dataScope=1（全部）：不约束（仍尊重前端传入的 deptId 过滤）。
 * - dataScope=2/3：仅允许访问 deptIds 内的数据；若请求同时指定了 deptId 过滤，
 *   则取二者交集（指定部门不在权限范围内时返回空集）。
 * - 无任何可访问部门时，令 id=-1 使其不匹配任何记录（安全兜底）。
 *
 * @param where 已有的 WHERE 对象（会被原地修改并返回）
 * @param reqUser 当前登录用户解析后的范围信息
 * @param queryDeptId 前端传入的部门过滤条件（可选）
 */
export function applyDataScopeWhere(
  where: Record<string, unknown>,
  reqUser: { dataScope?: number; deptId?: number; deptIds?: number[]; tenantId?: number },
  queryDeptId?: number,
): Record<string, unknown> {
  const scope = reqUser.dataScope

  // 租户约束：兜底 -1 防止数据泄漏（属性名，Sequelize 映射为 tenantId 列）
  where.tenantId = reqUser.tenantId ?? -1

  // 未携带 dataScope（旧 token 过渡期）或缺省：视为全部，不约束
  if (scope === undefined || scope === 1) {
    return where
  }

  const allowed = reqUser.deptIds && reqUser.deptIds.length ? reqUser.deptIds : reqUser.deptId ? [reqUser.deptId] : []

  let finalIds = allowed
  if (queryDeptId) {
    finalIds = allowed.includes(queryDeptId) ? [queryDeptId] : []
  }

  if (finalIds.length === 0) {
    where.id = { [Op.eq]: -1 }
  } else {
    where.deptId = { [Op.in]: finalIds }
  }
  return where
}

/**
 * 取当前用户的可见部门集合。
 * - 返回 null：不限制（dataScope=1 或旧 token 未携带范围）；
 * - 返回数组：仅允许这些部门；空数组表示无任何可见部门（调用方须给出空结果）。
 */
export function scopedDeptIds(reqUser?: { dataScope?: number; deptId?: number; deptIds?: number[] }): number[] | null {
  const scope = reqUser?.dataScope
  if (scope === undefined || scope === 1) return null
  if (reqUser?.deptIds && reqUser.deptIds.length) return reqUser.deptIds
  return reqUser?.deptId ? [reqUser.deptId] : []
}

/**
 * 判断目标用户是否落在当前用户的数据权限范围内。
 * - scope=1（全部）或缺失：始终允许；
 * - 否则：目标部门需在允许部门列表内。
 */
export function isTargetInScope(targetDeptId: number | null | undefined, reqUser?: { dataScope?: number; deptId?: number; deptIds?: number[] }): boolean {
  const scope = reqUser?.dataScope
  if (scope === undefined || scope === 1) return true
  const allowed = reqUser?.deptIds && reqUser.deptIds.length ? reqUser.deptIds : reqUser?.deptId ? [reqUser.deptId] : []
  if (allowed.length === 0) return false
  return targetDeptId != null && allowed.includes(targetDeptId)
}
