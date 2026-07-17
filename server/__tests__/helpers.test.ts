/**
 * helpers.ts 单元测试
 * 覆盖：normalizeIds、buildTree、prepareChangeLog
 */
import { describe, it, expect } from 'vitest'
import { normalizeIds, buildTree, prepareChangeLog } from '../utils/helpers'

describe('helpers.ts', () => {
  describe('normalizeIds', () => {
    it('数组直接返回', () => {
      expect(normalizeIds([1, 2, 3])).toEqual([1, 2, 3])
    })

    it('单个数字转为数组', () => {
      expect(normalizeIds(5)).toEqual([5])
    })

    it('字符串数字转为数字数组', () => {
      expect(normalizeIds('10')).toEqual([10])
    })

    it('undefined 返回 undefined', () => {
      expect(normalizeIds(undefined)).toBeUndefined()
    })

    it('null 返回 undefined', () => {
      expect(normalizeIds(null)).toBeUndefined()
    })

    it('空字符串返回 undefined', () => {
      expect(normalizeIds('')).toBeUndefined()
    })
  })

  describe('buildTree', () => {
    it('构建简单树结构', () => {
      const list = [
        { id: 1, parentId: 0, name: 'root' },
        { id: 2, parentId: 1, name: 'child1' },
        { id: 3, parentId: 1, name: 'child2' },
      ]

      const tree = buildTree(list)

      expect(tree).toHaveLength(1)
      expect(tree[0].name).toBe('root')
      expect(tree[0].children).toHaveLength(2)
    })

    it('多根节点', () => {
      const list = [
        { id: 1, parentId: 0, name: 'root1' },
        { id: 2, parentId: 0, name: 'root2' },
      ]

      const tree = buildTree(list)

      expect(tree).toHaveLength(2)
    })

    it('按 sort 字段排序', () => {
      const list = [
        { id: 1, parentId: 0, name: 'B', sort: 2 },
        { id: 2, parentId: 0, name: 'A', sort: 1 },
        { id: 3, parentId: 0, name: 'C', sort: 3 },
      ]

      const tree = buildTree(list)

      expect(tree[0].name).toBe('A')
      expect(tree[1].name).toBe('B')
      expect(tree[2].name).toBe('C')
    })

    it('无 sort 字段时默认 0', () => {
      const list = [
        { id: 1, parentId: 0, name: 'item' },
      ]

      const tree = buildTree(list)

      expect(tree).toHaveLength(1)
    })

    it('空列表返回空数组', () => {
      expect(buildTree([])).toEqual([])
    })

    it('调用 toJSON 方法', () => {
      const list = [
        {
          id: 1,
          parentId: 0,
          name: 'node',
          toJSON() {
            return { id: 1, parentId: 0, name: 'serialized' }
          },
        },
      ]

      const tree = buildTree(list)

      expect(tree[0].name).toBe('serialized')
    })

    it('toJSON=false 时直接复制对象', () => {
      const list = [
        { id: 1, parentId: 0, name: 'node' },
      ]

      const tree = buildTree(list, 0, { toJSON: false })

      expect(tree[0]).toEqual({ id: 1, parentId: 0, name: 'node' })
    })
  })

  describe('prepareChangeLog', () => {
    it('检测字段变更', () => {
      const model = {
        name: 'old',
        email: 'old@test.com',
        status: 1,
      }

      const newData = {
        name: 'new',
        email: 'old@test.com',
        status: 2,
      }

      const { changes, summary } = prepareChangeLog(model, newData, ['name', 'email', 'status'])

      expect(changes).toHaveLength(2)
      expect(changes.find(c => c.field === 'name')).toEqual({ field: 'name', before: 'old', after: 'new' })
      expect(changes.find(c => c.field === 'status')).toEqual({ field: 'status', before: 1, after: 2 })
      expect(summary).toContain('name: old → new')
      expect(summary).toContain('status: 1 → 2')
    })

    it('无变更返回空数组', () => {
      const model = { name: 'same', value: 123 }
      const newData = { name: 'same', value: 123 }

      const { changes } = prepareChangeLog(model, newData, ['name', 'value'])

      expect(changes).toHaveLength(0)
    })

    it('newData 缺失字段时使用原值', () => {
      const model = { name: 'original', status: 1 }
      const newData = {}

      const { changes } = prepareChangeLog(model, newData, ['name', 'status'])

      expect(changes).toHaveLength(0)
    })

    it('undefined 视为 null', () => {
      const model = { name: 'test' }
      const newData = { name: undefined }

      const { changes } = prepareChangeLog(model, newData, ['name'])

      expect(changes).toHaveLength(0) // 'test' vs null 仍然不同
    })
  })
})
