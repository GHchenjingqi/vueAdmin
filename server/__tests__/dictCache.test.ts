import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFindAll } = vi.hoisted(() => ({
  mockFindAll: vi.fn(),
}))

vi.mock('../models/DictData.js', () => ({
  default: {
    findAll: mockFindAll,
  },
}))

vi.mock('../utils/fileLogger.js', () => ({
  logInfo: vi.fn(),
}))

import { getDictOptions, loadDictOptions, refreshAllDictCache, refreshDictCache, getCachedDictTypes } from '../utils/dictCache'

describe('dictCache', () => {
  beforeEach(() => {
    mockFindAll.mockReset()
    const keys = getCachedDictTypes()
    keys.forEach((key) => {
      refreshDictCache(key)
    })
  })

  describe('getDictOptions', () => {
    it('缓存未命中时从数据库加载', async () => {
      mockFindAll.mockResolvedValueOnce([
        { label: '男', value: '1', sort: 1 },
        { label: '女', value: '2', sort: 2 },
      ])

      const options = await getDictOptions('gender')

      expect(options).toEqual([
        { label: '男', value: '1', sort: 1 },
        { label: '女', value: '2', sort: 2 },
      ])
      expect(mockFindAll).toHaveBeenCalledTimes(1)
    })

    it('缓存命中时不查询数据库', async () => {
      mockFindAll.mockResolvedValueOnce([
        { label: '男', value: '1', sort: 1 },
      ])

      await getDictOptions('gender')
      await getDictOptions('gender')

      expect(mockFindAll).toHaveBeenCalledTimes(1)
    })

    it('数据库返回空时返回空数组', async () => {
      mockFindAll.mockResolvedValueOnce([])

      const options = await getDictOptions('unknown_type')

      expect(options).toEqual([])
    })
  })

  describe('loadDictOptions', () => {
    it('加载并缓存字典选项', async () => {
      mockFindAll.mockResolvedValueOnce([
        { label: '启用', value: '1', sort: 1 },
        { label: '禁用', value: '0', sort: 2 },
      ])

      await loadDictOptions('status')

      const options = await getDictOptions('status')
      expect(options).toHaveLength(2)
      expect(mockFindAll).toHaveBeenCalledTimes(1)
    })
  })

  describe('refreshAllDictCache', () => {
    it('清空所有缓存并返回清空数量', async () => {
      mockFindAll.mockResolvedValueOnce([{ label: 'A', value: 'a', sort: 1 }])
      await getDictOptions('type1')

      mockFindAll.mockResolvedValueOnce([{ label: 'B', value: 'b', sort: 1 }])
      await getDictOptions('type2')

      const count = await refreshAllDictCache()

      expect(count).toBe(2)
    })

    it('缓存为空时返回 0', async () => {
      const keys = getCachedDictTypes()
      keys.forEach((key) => refreshDictCache(key))

      const count = await refreshAllDictCache()
      expect(count).toBe(0)
    })
  })

  describe('refreshDictCache', () => {
    it('删除指定类型的缓存', async () => {
      mockFindAll.mockResolvedValueOnce([{ label: 'A', value: 'a', sort: 1 }])
      await getDictOptions('type1')

      refreshDictCache('type1')

      mockFindAll.mockResolvedValueOnce([{ label: 'A2', value: 'a2', sort: 1 }])
      const options = await getDictOptions('type1')
      expect(options).toEqual([{ label: 'A2', value: 'a2', sort: 1 }])
      expect(mockFindAll).toHaveBeenCalledTimes(2)
    })
  })

  describe('getCachedDictTypes', () => {
    it('返回已缓存的字典类型列表', async () => {
      mockFindAll.mockResolvedValueOnce([{ label: 'A', value: 'a', sort: 1 }])
      await getDictOptions('type1')

      const types = getCachedDictTypes()
      expect(types).toContain('type1')
    })

    it('空缓存返回空数组', () => {
      const keys = getCachedDictTypes()
      keys.forEach((key) => refreshDictCache(key))

      const types = getCachedDictTypes()
      expect(types).toEqual([])
    })
  })
})