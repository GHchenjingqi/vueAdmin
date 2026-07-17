import { describe, it, expect } from 'vitest'
import { computeDiff } from '../utils/diff'

describe('computeDiff', () => {
  it('检测到字段值变化时返回差异', () => {
    const before = { name: 'Alice', age: 25 }
    const after = { name: 'Bob', age: 25 }
    const changes = computeDiff(before, after, ['name', 'age'])
    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({ field: 'name', before: 'Alice', after: 'Bob' })
  })

  it('多字段同时变化时返回所有差异', () => {
    const before = { name: 'Alice', age: 25 }
    const after = { name: 'Bob', age: 30 }
    const changes = computeDiff(before, after, ['name', 'age'])
    expect(changes).toHaveLength(2)
  })

  it('字段值未变化时返回空数组', () => {
    const before = { name: 'Alice', age: 25 }
    const after = { name: 'Alice', age: 25 }
    const changes = computeDiff(before, after, ['name', 'age'])
    expect(changes).toHaveLength(0)
  })

  it('undefined 统一转为 null 进行比较', () => {
    const before = { name: undefined }
    const after = { name: null }
    const changes = computeDiff(before, after, ['name'])
    expect(changes).toHaveLength(0)
  })

  it('区分 null 和实际值', () => {
    const before = { name: null, age: undefined }
    const after = { name: 'Alice', age: 25 }
    const changes = computeDiff(before, after, ['name', 'age'])
    expect(changes).toHaveLength(2)
    expect(changes[0]).toEqual({ field: 'name', before: null, after: 'Alice' })
    expect(changes[1]).toEqual({ field: 'age', before: null, after: 25 })
  })

  it('数字类型变化通过字符串比较检测', () => {
    const before = { count: 0 }
    const after = { count: 1 }
    const changes = computeDiff(before, after, ['count'])
    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({ field: 'count', before: 0, after: 1 })
  })

  it('布尔类型变化检测', () => {
    const before = { active: true }
    const after = { active: false }
    const changes = computeDiff(before, after, ['active'])
    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({ field: 'active', before: true, after: false })
  })

  it('只对比指定字段', () => {
    const before = { name: 'Alice', age: 25, city: 'NY' }
    const after = { name: 'Alice', age: 30, city: 'LA' }
    const changes = computeDiff(before, after, ['name'])
    expect(changes).toHaveLength(0)
  })

  it('空字段列表返回空数组', () => {
    const before = { name: 'Alice' }
    const after = { name: 'Bob' }
    const changes = computeDiff(before, after, [])
    expect(changes).toHaveLength(0)
  })
})