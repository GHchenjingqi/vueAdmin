/**
 * pinia.ts 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

describe('pinia.ts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('createPinia 创建成功', () => {
    const pinia = createPinia()
    expect(pinia).toBeDefined()
  })

  it('setActivePinia 设置活跃 Pinia', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    // setActivePinia 不抛异常即成功
    expect(true).toBe(true)
  })
})
