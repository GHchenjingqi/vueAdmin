/**
 * userService.ts 单元测试
 * 覆盖：buildUserWhere、listUsers、getUserById、createUser、updateUser、deleteUser
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Op } from 'sequelize'

// Mock 依赖
vi.mock('../models/User.js', () => ({
  default: {
    findAndCountAll: vi.fn(),
    findByPk: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    destroy: vi.fn(),
    count: vi.fn(),
  },
}))

vi.mock('../models/Department.js', () => ({
  default: {},
}))

vi.mock('../models/Role.js', () => ({
  default: {},
}))

vi.mock('../models/UserRole.js', () => ({
  default: {
    destroy: vi.fn(),
    bulkCreate: vi.fn(),
  },
}))

vi.mock('../utils/logger.js', () => ({
  logOperation: vi.fn(),
}))

vi.mock('../utils/exportExcel.js', () => ({
  exportExcel: vi.fn(),
}))

import { buildUserWhere, listUsers, getUserById, createUser, updateUser, deleteUser } from '../services/userService.js'
import User from '../models/User.js'

describe('userService.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildUserWhere', () => {
    it('空查询返回空对象', () => {
      const where = buildUserWhere({})
      expect(where).toEqual({})
    })

    it('username 模糊查询', () => {
      const where = buildUserWhere({ username: 'admin' })
      expect(where.username).toEqual({ [Op.like]: '%admin%' })
    })

    it('nickname 模糊查询', () => {
      const where = buildUserWhere({ nickname: '张三' })
      expect(where.nickname).toEqual({ [Op.like]: '%张三%' })
    })

    it('phone 模糊查询', () => {
      const where = buildUserWhere({ phone: '138' })
      expect(where.phone).toEqual({ [Op.like]: '%138%' })
    })

    it('deptId 精确查询', () => {
      const where = buildUserWhere({ deptId: 5 })
      expect(where.deptId).toBe(5)
    })

    it('日期范围查询', () => {
      const where = buildUserWhere({ startDate: '2024-01-01', endDate: '2024-12-31' })

      expect(where.createdAt[Op.gte]).toEqual(new Date('2024-01-01'))
      expect(where.createdAt[Op.lte]).toEqual(new Date('2024-12-31 23:59:59'))
    })

    it('仅 startDate', () => {
      const where = buildUserWhere({ startDate: '2024-01-01' })
      expect(where.createdAt[Op.gte]).toEqual(new Date('2024-01-01'))
      expect(where.createdAt[Op.lte]).toBeUndefined()
    })

    it('仅 endDate', () => {
      const where = buildUserWhere({ endDate: '2024-12-31' })
      expect(where.createdAt[Op.gte]).toBeUndefined()
      expect(where.createdAt[Op.lte]).toEqual(new Date('2024-12-31 23:59:59'))
    })

    it('组合查询', () => {
      const where = buildUserWhere({
        username: 'admin',
        deptId: 1,
        startDate: '2024-01-01',
      })

      expect(where.username).toBeDefined()
      expect(where.deptId).toBe(1)
      expect(where.createdAt).toBeDefined()
    })
  })

  describe('listUsers', () => {
    it('分页查询用户列表', async () => {
      const mockUsers = [
        { id: 1, username: 'user1' },
        { id: 2, username: 'user2' },
      ]

      vi.mocked(User.findAndCountAll).mockResolvedValueOnce({
        rows: mockUsers as any,
        count: 2,
      })

      const result = await listUsers({}, 1, 10)

      expect(result.rows).toEqual(mockUsers)
      expect(result.total).toBe(2)
      expect(User.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          offset: 0,
          limit: 10,
          order: [['id', 'DESC']],
        }),
      )
    })

    it('第 2 页 offset 正确', async () => {
      vi.mocked(User.findAndCountAll).mockResolvedValueOnce({ rows: [], count: 0 })

      await listUsers({}, 2, 20)

      expect(User.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          offset: 20,
          limit: 20,
        }),
      )
    })

    it('带查询条件', async () => {
      vi.mocked(User.findAndCountAll).mockResolvedValueOnce({ rows: [], count: 0 })

      await listUsers({ username: 'admin' }, 1, 10)

      expect(User.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            username: { [Op.like]: '%admin%' },
          }),
        }),
      )
    })
  })

  describe('getUserById', () => {
    it('用户存在返回用户信息', async () => {
      const mockUser = { id: 1, username: 'admin' }
      vi.mocked(User.findByPk).mockResolvedValueOnce(mockUser as any)

      const result = await getUserById(1)

      expect(result).toEqual(mockUser)
    })

    it('用户不存在抛出 404 错误', async () => {
      vi.mocked(User.findByPk).mockResolvedValueOnce(null)

      await expect(getUserById(999)).rejects.toThrow('用户不存在')
    })
  })

  describe('createUser', () => {
    it('创建用户成功', async () => {
      const mockUser = { id: 1, username: 'newuser', nickname: '新用户' }
      vi.mocked(User.findOne).mockResolvedValueOnce(null)
      vi.mocked(User.create).mockResolvedValueOnce(mockUser as any)

      await createUser(
        {
          username: 'newuser',
          password: 'Test123!',
          nickname: '新用户',
        },
        { id: 1, username: 'admin' },
      )

      expect(User.create).toHaveBeenCalled()
    })

    it('用户名已存在抛出错误', async () => {
      vi.mocked(User.findOne).mockResolvedValueOnce({ id: 1 } as any)

      await expect(
        createUser(
          { username: 'existing', password: 'Test123!', nickname: 'test' },
          { id: 1, username: 'admin' },
        ),
      ).rejects.toThrow('用户名已存在')
    })
  })

  describe('updateUser', () => {
    it('更新用户信息成功', async () => {
      const mockUser = {
        id: 1,
        username: 'admin',
        nickname: '管理员',
        update: vi.fn(),
      }

      vi.mocked(User.findByPk).mockResolvedValueOnce(mockUser as any)

      await updateUser(1, { nickname: '超级管理员' }, { id: 1, username: 'admin' })

      expect(mockUser.update).toHaveBeenCalled()
    })

    it('用户不存在抛出错误', async () => {
      vi.mocked(User.findByPk).mockResolvedValueOnce(null)

      await expect(updateUser(999, { nickname: 'test' }, { id: 1, username: 'admin' })).rejects.toThrow('用户不存在')
    })
  })

  describe('deleteUser', () => {
    it('删除用户成功', async () => {
      const mockUser = { id: 1, destroy: vi.fn() }
      vi.mocked(User.findByPk).mockResolvedValueOnce(mockUser as any)

      await deleteUser(1)

      expect(mockUser.destroy).toHaveBeenCalled()
    })

    it('用户不存在抛出错误', async () => {
      vi.mocked(User.findByPk).mockResolvedValueOnce(null)

      await expect(deleteUser(999)).rejects.toThrow('用户不存在')
    })
  })
})
