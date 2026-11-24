import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const mocks = vi.hoisted(() => ({
  portalApi: { getPrompts: vi.fn() },
  message: { error: vi.fn() },
}))

vi.mock('@/api', () => ({ portalApi: mocks.portalApi }))
vi.mock('@/utils/error', () => ({ getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)) }))
vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, ElMessage: mocks.message }
})
vi.mock('vue-router', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, useRouter: () => ({ push: vi.fn() }) }
})

import PoseGallery from '@/views/portal/PoseGallery.vue'

const mountPage = () =>
  mount(PoseGallery, {
    global: {
      directives: { loading: {} },
      stubs: {
        'el-input': { template: '<div class="stub-input"><slot /></div>' },
        'el-select': { template: '<div class="stub-select"><slot /></div>' },
        'el-option': { template: '<div class="stub-option"><slot /></div>' },
        'el-empty': { template: '<div class="stub-empty"><slot /></div>' },
        'el-button': { template: '<button><slot /></button>' },
        'el-icon': { template: '<span class="stub-icon"><slot /></span>' },
      },
    },
  })

describe('PoseGallery 只读取姿势参考库数据', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.portalApi.getPrompts.mockResolvedValue({
      data: {
        total: 1,
        rows: [
          {
            id: 501,
            title: '全身单人-标准系 · P001 · 站姿',
            content: '体系：全身单人-标准系\n分类：站姿\n姿势编号：P001\n姿势名称：站姿',
            categoryId: 14,
            categoryName: '全身单人-标准系',
            images: [{ url: '/uploads/pose_p001_front.jpg', filePath: '/uploads/pose_p001_front.jpg' }],
          },
        ],
      },
    })
  })

  it('1. 读取提示词时始终带 scope=pose，不依赖分类启用状态', async () => {
    mountPage()
    await flushPromises()
    await nextTick()
    expect(mocks.portalApi.getPrompts).toHaveBeenCalledWith({ page: 1, pageSize: 100, scope: 'pose' })
  })

  it('2. 姿势数据正常渲染统计与卡片', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await nextTick()
    const text = wrapper.text()
    expect(text).toContain('P001')
    expect(text).toContain('全身单人-标准系')
    expect(text).toContain('正面')
    expect(wrapper.findAll('.pose-card').length).toBe(1)
  })
})
