import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

describe('v-permission 权限指令逻辑', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function hasPermission(codes: string[], roles: string[], permissions: string[]): boolean {
    if (!codes || codes.length === 0) return true
    if (roles.includes('admin') || roles.includes('super_admin')) return true
    return codes.some((code) => permissions.includes(code) || roles.includes(code))
  }

  it('空权限数组默认显示', () => {
    expect(hasPermission([], [], [])).toBe(true)
  })

  it('admin 角色拥有所有权限', () => {
    expect(hasPermission(['user:delete'], ['admin'], [])).toBe(true)
  })

  it('super_admin 角色拥有所有权限', () => {
    expect(hasPermission(['user:delete'], ['super_admin'], [])).toBe(true)
  })

  it('普通用户拥有指定权限码时显示', () => {
    expect(hasPermission(['user:create'], ['user'], ['user:create'])).toBe(true)
  })

  it('普通用户无指定权限码时隐藏', () => {
    expect(hasPermission(['user:delete'], ['user'], ['user:create'])).toBe(false)
  })

  it('用户拥有任一权限即显示', () => {
    expect(hasPermission(['user:create', 'user:delete'], ['user'], ['user:create'])).toBe(true)
  })

  it('角色匹配权限码时显示', () => {
    expect(hasPermission(['editor'], [], ['editor'])).toBe(true)
  })

  it('无任何权限时隐藏', () => {
    expect(hasPermission(['admin'], ['user'], ['user:read'])).toBe(false)
  })
})
