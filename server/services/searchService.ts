/**
 * 全局搜索 Service 层
 *
 * 职责：封装全局搜索的业务逻辑
 */

import { Op } from 'sequelize'
import User from '../models/User.js'
import Department from '../models/Department.js'
import Role from '../models/Role.js'
import Menu from '../models/Menu.js'
import sequelize from '../config/database.js'

interface SearchResultModule {
  module: string
  icon: string
  path: string
  items: SearchResultItem[]
}

interface SearchResultItem {
  id: number
  label: string
  description: string
  status?: number
  url: string
  type?: string
}

/**
 * 全局搜索
 */
export async function globalSearch(keyword: string, userId: number): Promise<SearchResultModule[]> {
  if (!keyword || keyword.trim().length < 1) {
    return []
  }

  const kw = `%${keyword.trim()}%`
  const results: SearchResultModule[] = []

  const userMenus = await sequelize.query(
    `SELECT m.id, m.name, m.path FROM menus m
     JOIN role_menus rm ON rm.menuId = m.id
     JOIN user_roles ur ON ur.roleId = rm.roleId
     WHERE ur.userId = ? AND m.type IN ('M') AND m.status = 1
     GROUP BY m.id`,
    { replacements: [userId], type: sequelize.QueryTypes.SELECT }
  ) as Array<{ id: number; name: string; path: string }>

  const menuPaths = userMenus.map(m => m.path)
  const menuNames = userMenus.map(m => m.name.toLowerCase())

  const canSearchUsers = menuPaths.some(p => p?.startsWith('/users')) || menuNames.some(n => n.includes('用户'))
  const canSearchDepts = menuPaths.some(p => p?.startsWith('/departments')) || menuNames.some(n => n.includes('部门'))
  const canSearchRoles = menuPaths.some(p => p?.startsWith('/roles')) || menuNames.some(n => n.includes('角色'))
  const canSearchMenus = menuPaths.some(p => p?.startsWith('/menus')) || menuNames.some(n => n.includes('菜单'))

  const searches: Promise<void>[] = []

  if (canSearchUsers) {
    searches.push(
      User.findAll({
        where: {
          [Op.or]: [
            { username: { [Op.like]: kw } },
            { email: { [Op.like]: kw } },
            { phone: { [Op.like]: kw } },
          ],
        },
        attributes: ['id', 'username', 'email', 'phone', 'status'],
        limit: 10,
      }).then(users => {
        if (users.length > 0) {
          results.push({
            module: '用户管理',
            icon: 'User',
            path: '/users',
            items: users.map(u => ({
              id: u.id,
              label: u.username,
              description: `${u.email || '-'} ${u.phone || '-'}`,
              status: u.status,
              url: `/users?id=${u.id}`,
            })),
          })
        }
      })
    )
  }

  if (canSearchDepts) {
    searches.push(
      Department.findAll({
        where: { name: { [Op.like]: kw } },
        attributes: ['id', 'name', 'leader', 'status'],
        limit: 10,
      }).then(depts => {
        if (depts.length > 0) {
          results.push({
            module: '部门管理',
            icon: 'OfficeBuilding',
            path: '/departments',
            items: depts.map(d => ({
              id: d.id,
              label: d.name,
              description: d.leader ? `负责人: ${d.leader}` : '',
              status: d.status,
              url: `/departments?id=${d.id}`,
            })),
          })
        }
      })
    )
  }

  if (canSearchRoles) {
    searches.push(
      Role.findAll({
        where: { name: { [Op.like]: kw } },
        attributes: ['id', 'name', 'code', 'status'],
        limit: 10,
      }).then(roles => {
        if (roles.length > 0) {
          results.push({
            module: '角色管理',
            icon: 'Avatar',
            path: '/roles',
            items: roles.map(r => ({
              id: r.id,
              label: r.name,
              description: r.code,
              status: r.status,
              url: `/roles?id=${r.id}`,
            })),
          })
        }
      })
    )
  }

  if (canSearchMenus) {
    searches.push(
      Menu.findAll({
        where: {
          name: { [Op.like]: kw },
          status: 1,
        },
        attributes: ['id', 'name', 'path', 'icon', 'type'],
        limit: 10,
      }).then(menus => {
        if (menus.length > 0) {
          results.push({
            module: '菜单管理',
            icon: 'Menu',
            path: '/menus',
            items: menus.map(m => ({
              id: m.id,
              label: m.name,
              description: m.path || '-',
              type: m.type,
              url: m.path || `/menus?id=${m.id}`,
            })),
          })
        }
      })
    )
  }

  const matchedMenus = userMenus.filter(m =>
    m.name.toLowerCase().includes(keyword.trim().toLowerCase())
  )
  if (matchedMenus.length > 0) {
    results.push({
      module: '功能菜单',
      icon: 'Link',
      path: '',
      items: matchedMenus.map(m => ({
        id: m.id,
        label: m.name,
        description: m.path || '-',
        url: m.path || '#',
      })),
    })
  }

  await Promise.all(searches)

  return results
}