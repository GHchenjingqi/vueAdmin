import { describe, it, expect } from 'vitest'
import { evaluateCondition } from '../utils/workflowExpression.js'

describe('workflowExpression', () => {
  it('数值比较表达式', () => {
    expect(evaluateCondition('amount > 1000', { amount: 1500 })).toBe(true)
    expect(evaluateCondition('amount > 1000', { amount: 500 })).toBe(false)
  })

  it('字符串相等表达式', () => {
    expect(evaluateCondition("type == 'A'", { type: 'A' })).toBe(true)
    expect(evaluateCondition("type == 'A'", { type: 'B' })).toBe(false)
  })

  it('逻辑组合表达式', () => {
    expect(evaluateCondition('(amount > 1000) and (type == "A")', { amount: 1500, type: 'A' })).toBe(true)
    expect(evaluateCondition('(amount > 1000) and (type == "A")', { amount: 500, type: 'A' })).toBe(false)
  })

  it('无效表达式返回 false', () => {
    expect(evaluateCondition('invalid syntax @@', {})).toBe(false)
  })

  it('变量不存在时返回 false', () => {
    expect(evaluateCondition('nonexistent > 100', {})).toBe(false)
  })
})