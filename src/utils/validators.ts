/**
 * 通用校验工具
 *
 * 集中管理表单校验规则，避免多组件重复定义。
 */

/** 密码强度结果 */
export interface PasswordStrength {
  hasUpper: boolean
  hasLower: boolean
  hasDigit: boolean
  hasSpecial: boolean
  hasLength: boolean
  /** 所有规则是否通过 */
  readonly isValid: boolean
}

/** 密码强度校验说明项 */
export const passwordStrengthRules = [
  { key: 'hasLength', label: '长度不少于8位' },
  { key: 'hasUpper', label: '包含大写字母' },
  { key: 'hasLower', label: '包含小写字母' },
  { key: 'hasDigit', label: '包含数字' },
  { key: 'hasSpecial', label: '包含特殊字符' },
]

/** 校验密码强度 */
export function checkPasswordStrength(password: string): PasswordStrength {
  return {
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasDigit: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
    hasLength: password.length >= 8,
    get isValid() {
      return this.hasUpper && this.hasLower && this.hasDigit && this.hasSpecial && this.hasLength
    },
  }
}

/** Element Plus 密码强度校验规则（直接用于 el-form rules） */
export function createPasswordStrengthValidator(_rule: unknown, value: string, callback: (error?: Error) => void): void {
  if (!value) {
    callback()
    return
  }
  if (!/[A-Z]/.test(value)) return callback(new Error('需包含大写字母'))
  if (!/[a-z]/.test(value)) return callback(new Error('需包含小写字母'))
  if (!/[0-9]/.test(value)) return callback(new Error('需包含数字'))
  if (!/[^A-Za-z0-9]/.test(value)) return callback(new Error('需包含特殊字符'))
  callback()
}

/** 密码确认校验规则 */
export function createConfirmValidator(targetField: () => string) {
  return (_rule: unknown, value: string, callback: (error?: Error) => void): void => {
    if (!value) {
      callback(new Error('请再次输入新密码'))
    } else if (value !== targetField()) {
      callback(new Error('两次输入的密码不一致'))
    } else {
      callback()
    }
  }
}
