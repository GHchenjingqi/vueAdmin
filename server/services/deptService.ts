/**
 * 部门管理 Service 层
 *
 * 职责：封装部门管理的所有业务逻辑
 */

import Department from '../models/Department.js'
import { AppError } from '../middleware/errorHandler.js'
import { buildTree, prepareChangeLog } from '../utils/helpers.js'
import { invalidateDeptScope, scopedDeptIds } from '../utils/dataScope.js'

const DEPT_TRACK_FIELDS = ['name', 'leader', 'phone', 'email', 'status', 'sort']

/** 数据权限作用对象（来自 req.user） */
type ScopeUser = { dataScope?: number; deptId?: number; deptIds?: number[] } | undefined

interface DeptCreateData {
  parentId?: number | null
  name: string
  sort?: number
  leader?: string
  phone?: string
  email?: string
  status?: number
}

type DeptUpdateData = Partial<DeptCreateData>

/** 按数据范围裁剪部门列表；不受限时原样返回 */
function filterByScope<T extends { id: number }>(rows: T[], reqUser: ScopeUser): T[] {
  const allowed = scopedDeptIds(reqUser)
  if (!allowed) return rows
  return rows.filter((row) => allowed.includes(row.id))
}

/**
 * 构建部门树。
 * 受限用户可见子树的根，其父级本身不在可见集合里；而 buildTree 以 parentId=0 起根，
 * 直接喂过滤结果会整棵丢空，因此改为从每个「父级不可见」的节点各自起根。
 */
function buildScopedTree<T extends { id: number; parentId: number }>(rows: T[], reqUser: ScopeUser): ReturnType<typeof buildTree> {
  const visible = filterByScope(rows, reqUser)
  const allowed = scopedDeptIds(reqUser)
  if (!allowed) return buildTree(visible)

  const visibleIds = new Set(visible.map((row) => row.id))
  const roots = visible.filter((row) => !visibleIds.has(row.parentId)).sort((a, b) => (a as any).sort - (b as any).sort)
  return roots.map((root) => {
    const children = buildTree(visible, root.id)
    const node = typeof (root as any).toJSON === 'function' ? (root as any).toJSON() : { ...root }
    if (children.length > 0) node.children = children
    return node
  })
}

/**
 * 断言目标部门在可维护范围内。
 * 部门是树结构，「本级及以下」意味着只能在自己那棵子树里增删改，
 * 否则部门主管可以把节点挂到别的部门下、或删掉别人的部门。
 */
function assertDeptVisible(id: number, reqUser: ScopeUser, message = '无权操作该部门'): void {
  const allowed = scopedDeptIds(reqUser)
  if (allowed && !allowed.includes(id)) throw new AppError(403, message)
}

/**
 * 获取部门列表
 */
export async function listDepts(scope?: string, reqUser?: ScopeUser) {
  if (scope === 'options') {
    const depts = await Department.findAll({
      where: { status: 1 },
      order: [['sort', 'ASC']],
      attributes: ['id', 'parentId', 'name'],
    })
    return buildScopedTree(depts, reqUser)
  }

  const depts = await Department.findAll({ order: [['sort', 'ASC']] })
  return buildScopedTree(depts, reqUser)
}

/**
 * 获取单个部门
 */
export async function getDeptById(id: number, reqUser?: ScopeUser) {
  const dept = await Department.findByPk(id)
  if (!dept) throw new AppError(404, '部门不存在')
  assertDeptVisible(id, reqUser, '无权访问该部门')
  return dept
}

/**
 * 创建部门
 */
export async function createDept(data: DeptCreateData, reqUser?: ScopeUser) {
  const { parentId, name, sort, leader, phone, email, status } = data
  // 顶级部门 parentId 为 0/空：受数据范围限制的用户不得新建顶级部门
  if (parentId) assertDeptVisible(parentId, reqUser, '无权在该部门下创建子部门')
  else if (scopedDeptIds(reqUser)) throw new AppError(403, '无权创建顶级部门')

  const dept = await Department.create({ parentId, name, sort, leader, phone, email, status })
  await invalidateDeptScope()
  return { id: dept.id, name }
}

/**
 * 更新部门
 */
export async function updateDept(id: number, data: DeptUpdateData, reqUser?: ScopeUser) {
  const dept = await Department.findByPk(id)
  if (!dept) throw new AppError(404, '部门不存在')
  assertDeptVisible(id, reqUser)
  // 改父级时新父级也必须在范围内，否则等于把部门迁出自己的子树
  if (data.parentId) assertDeptVisible(data.parentId, reqUser, '无权将部门移至该上级部门')

  const { parentId, name, sort, leader, phone, email, status } = data
  const updateData = { parentId, name, sort, leader, phone, email, status }
  const { changes, summary } = prepareChangeLog(dept.toJSON(), updateData, DEPT_TRACK_FIELDS)

  await dept.update(updateData)
  await invalidateDeptScope()

  return { name, changes, summary }
}

/**
 * 删除部门
 */
export async function deleteDept(id: number, reqUser?: ScopeUser) {
  const dept = await Department.findByPk(id)
  if (!dept) throw new AppError(404, '部门不存在')
  assertDeptVisible(id, reqUser)

  const children = await Department.findOne({ where: { parentId: id } })
  if (children) throw new AppError(400, '该部门下存在子部门，无法删除')

  await dept.destroy()
  await invalidateDeptScope()
  return { name: dept.name }
}

/**
 * 获取部门下拉选项
 */
export async function getDeptOptions(reqUser?: ScopeUser) {
  const depts = await Department.findAll({
    where: { status: 1 },
    order: [['sort', 'ASC']],
    attributes: ['id', 'parentId', 'name'],
  })
  return buildScopedTree(depts, reqUser)
}
