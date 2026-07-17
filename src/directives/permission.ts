/**
 * v-permission 权限指令
 *
 * 用法：
 * ```html
 * <el-button v-permission="['admin']">管理员按钮</el-button>
 * <el-button v-permission="['user:create', 'user:edit']">需要任一权限</el-button>
 * ```
 *
 * 逻辑：
 * - 传入字符串数组，用户拥有其中任一权限即显示
 * - 传入空数组或未传入则默认显示
 * - 无权限时移除元素（display: none）
 */
import type { Directive, DirectiveBinding } from 'vue'
import { useUserStore } from '@/stores'
import { pinia } from '@/stores/pinia'

function hasPermission(codes: string[]): boolean {
  if (!codes || codes.length === 0) return true

  const userStore = useUserStore(pinia)

  const roles = userStore.roles || []
  const permissions = userStore.userInfo?.permissions || []

  if (roles.includes('admin') || roles.includes('super_admin')) {
    return true
  }

  return codes.some((code) => permissions.includes(code) || roles.includes(code))
}

export const vPermission: Directive<HTMLElement, string[]> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string[]>) {
    const codes = binding.value
    if (!hasPermission(codes)) {
      el.style.display = 'none'
    }
  },
  updated(el: HTMLElement, binding: DirectiveBinding<string[]>) {
    const codes = binding.value
    if (!hasPermission(codes)) {
      el.style.display = 'none'
    } else {
      el.style.display = ''
    }
  },
}
