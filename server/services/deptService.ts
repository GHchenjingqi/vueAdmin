/**
 * 部门管理 Service 层
 *
 * 职责：封装部门管理的所有业务逻辑
 */

import Department from '../models/Department.js'
import { AppError } from '../middleware/errorHandler.js'
import { buildTree, prepareChangeLog } from '../utils/helpers.js'

const DEPT_TRACK_FIELDS = ['name', 'leader', 'phone', 'email', 'status', 'sort']

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

/**
 * 获取部门列表
 */
export async function listDepts(scope?: string) {
  if (scope === 'options') {
    const depts = await Department.findAll({
      where: { status: 1 },
      order: [['sort', 'ASC']],
      attributes: ['id', 'parentId', 'name'],
    })
    return buildTree(depts)
  }

  const depts = await Department.findAll({ order: [['sort', 'ASC']] })
  return buildTree(depts)
}

/**
 * 获取单个部门
 */
export async function getDeptById(id: number) {
  const dept = await Department.findByPk(id)
  if (!dept) throw new AppError(404, '部门不存在')
  return dept
}

/**
 * 创建部门
 */
export async function createDept(data: DeptCreateData) {
  const { parentId, name, sort, leader, phone, email, status } = data
  const dept = await Department.create({ parentId, name, sort, leader, phone, email, status })
  return { id: dept.id, name }
}

/**
 * 更新部门
 */
export async function updateDept(id: number, data: DeptUpdateData) {
  const dept = await Department.findByPk(id)
  if (!dept) throw new AppError(404, '部门不存在')

  const { parentId, name, sort, leader, phone, email, status } = data
  const updateData = { parentId, name, sort, leader, phone, email, status }
  const { changes, summary } = prepareChangeLog(dept.toJSON(), updateData, DEPT_TRACK_FIELDS)

  await dept.update(updateData)

  return { name, changes, summary }
}

/**
 * 删除部门
 */
export async function deleteDept(id: number) {
  const dept = await Department.findByPk(id)
  if (!dept) throw new AppError(404, '部门不存在')

  const children = await Department.findOne({ where: { parentId: id } })
  if (children) throw new AppError(400, '该部门下存在子部门，无法删除')

  await dept.destroy()
  return { name: dept.name }
}

/**
 * 获取部门下拉选项
 */
export async function getDeptOptions() {
  const depts = await Department.findAll({
    where: { status: 1 },
    order: [['sort', 'ASC']],
    attributes: ['id', 'parentId', 'name'],
  })
  return buildTree(depts)
}