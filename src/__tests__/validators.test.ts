import { describe, it, expect, vi } from 'vitest'
import { checkPasswordStrength, createPasswordStrengthValidator, createConfirmValidator, passwordStrengthRules } from '@/utils/validators'

describe('validators', () => {
  describe('passwordStrengthRules', () => {
    it('应包含 5 条规则', () => {
      expect(passwordStrengthRules).toHaveLength(5)
    })

    it('每条规则包含 key 和 label', () => {
      for (const rule of passwordStrengthRules) {
        expect(rule).toHaveProperty('key')
        expect(rule).toHaveProperty('label')
        expect(typeof rule.key).toBe('string')
        expect(typeof rule.label).toBe('string')
      }
    })
  })

  describe('checkPasswordStrength', () => {
    it('强密码满足所有条件', () => {
      const result = checkPasswordStrength('Abc123!@')
      expect(result.hasUpper).toBe(true)
      expect(result.hasLower).toBe(true)
      expect(result.hasDigit).toBe(true)
      expect(result.hasSpecial).toBe(true)
      expect(result.hasLength).toBe(true)
      expect(result.isValid).toBe(true)
    })

    it('空密码不满足任何条件', () => {
      const result = checkPasswordStrength('')
      expect(result.hasUpper).toBe(false)
      expect(result.hasLower).toBe(false)
      expect(result.hasDigit).toBe(false)
      expect(result.hasSpecial).toBe(false)
      expect(result.hasLength).toBe(false)
      expect(result.isValid).toBe(false)
    })

    it('缺少大写字母', () => {
      const result = checkPasswordStrength('abc123!@')
      expect(result.hasUpper).toBe(false)
      expect(result.isValid).toBe(false)
    })

    it('缺少小写字母', () => {
      const result = checkPasswordStrength('ABC123!@')
      expect(result.hasLower).toBe(false)
      expect(result.isValid).toBe(false)
    })

    it('缺少数字', () => {
      const result = checkPasswordStrength('Abcdef!@')
      expect(result.hasDigit).toBe(false)
      expect(result.isValid).toBe(false)
    })

    it('缺少特殊字符', () => {
      const result = checkPasswordStrength('Abc12345')
      expect(result.hasSpecial).toBe(false)
      expect(result.isValid).toBe(false)
    })

    it('长度不足 8 位', () => {
      const result = checkPasswordStrength('Ab1!')
      expect(result.hasLength).toBe(false)
      expect(result.isValid).toBe(false)
    })

    it('刚好 8 位满足长度条件', () => {
      const result = checkPasswordStrength('Abc12!@x')
      expect(result.hasLength).toBe(true)
    })

    it('isValid 是只读计算属性', () => {
      const result = checkPasswordStrength('weak')
      expect(result.isValid).toBe(false)
    })
  })

  describe('createPasswordStrengthValidator', () => {
    it('空值时直接通过', () => {
      const callback = vi.fn()
      createPasswordStrengthValidator({}, '', callback)
      expect(callback).toHaveBeenCalledWith()
    })

    it('缺少大写字母时返回错误', () => {
      const callback = vi.fn()
      createPasswordStrengthValidator({}, 'abc123!@', callback)
      expect(callback).toHaveBeenCalledWith(expect.any(Error))
      expect(callback.mock.calls[0][0].message).toBe('需包含大写字母')
    })

    it('缺少小写字母时返回错误', () => {
      const callback = vi.fn()
      createPasswordStrengthValidator({}, 'ABC123!@', callback)
      expect(callback).toHaveBeenCalledWith(expect.any(Error))
      expect(callback.mock.calls[0][0].message).toBe('需包含小写字母')
    })

    it('缺少数字时返回错误', () => {
      const callback = vi.fn()
      createPasswordStrengthValidator({}, 'Abcdef!@', callback)
      expect(callback).toHaveBeenCalledWith(expect.any(Error))
      expect(callback.mock.calls[0][0].message).toBe('需包含数字')
    })

    it('缺少特殊字符时返回错误', () => {
      const callback = vi.fn()
      createPasswordStrengthValidator({}, 'Abc12345', callback)
      expect(callback).toHaveBeenCalledWith(expect.any(Error))
      expect(callback.mock.calls[0][0].message).toBe('需包含特殊字符')
    })

    it('满足所有条件时通过', () => {
      const callback = vi.fn()
      createPasswordStrengthValidator({}, 'Abc123!@', callback)
      expect(callback).toHaveBeenCalledWith()
    })

    it('遇到第一个失败条件即停止（短路）', () => {
      const callback = vi.fn()
      // 缺少大写和小写
      createPasswordStrengthValidator({}, '12345678!@', callback)
      // 只回调一次，且是大写字母错误
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback.mock.calls[0][0].message).toBe('需包含大写字母')
    })
  })

  describe('createConfirmValidator', () => {
    it('值为空时返回错误', () => {
      const getTarget = () => 'password123'
      const validator = createConfirmValidator(getTarget)
      const callback = vi.fn()
      validator({}, '', callback)
      expect(callback).toHaveBeenCalledWith(expect.any(Error))
      expect(callback.mock.calls[0][0].message).toBe('请再次输入新密码')
    })

    it('值不匹配时返回错误', () => {
      const getTarget = () => 'password123'
      const validator = createConfirmValidator(getTarget)
      const callback = vi.fn()
      validator({}, 'different', callback)
      expect(callback).toHaveBeenCalledWith(expect.any(Error))
      expect(callback.mock.calls[0][0].message).toBe('两次输入的密码不一致')
    })

    it('值匹配时通过', () => {
      const getTarget = () => 'password123'
      const validator = createConfirmValidator(getTarget)
      const callback = vi.fn()
      validator({}, 'password123', callback)
      expect(callback).toHaveBeenCalledWith()
    })

    it('动态获取目标值', () => {
      let targetPwd = 'first'
      const getTarget = () => targetPwd
      const validator = createConfirmValidator(getTarget)
      const callback1 = vi.fn()
      validator({}, 'first', callback1)
      expect(callback1).toHaveBeenCalledWith()

      targetPwd = 'second'
      const callback2 = vi.fn()
      validator({}, 'first', callback2)
      expect(callback2).toHaveBeenCalledWith(expect.any(Error))
    })
  })
})
