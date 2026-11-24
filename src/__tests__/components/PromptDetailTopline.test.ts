import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const mocks = vi.hoisted(() => ({
  getPrompt: vi.fn(),
  getRelated: vi.fn(),
}))

vi.mock('@/api', () => ({
  portalApi: { getPrompt: mocks.getPrompt, getRelated: mocks.getRelated },
}))
vi.mock('@/utils/error', () => ({ getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)) }))
vi.mock('@/utils/clipboard', () => ({ copyText: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '3' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

import PromptDetail from '@/views/portal/PromptDetail.vue'

const mountPage = () =>
  mount(PromptDetail, {
    global: {
      stubs: {
        'el-breadcrumb': { template: '<div class="stub-breadcrumb"><slot /></div>' },
        'el-breadcrumb-item': { template: '<span><slot /></span>' },
        'el-icon': { template: '<span><slot /></span>' },
        'el-image': { template: '<div />' },
        'el-button': { template: '<button class="stub-btn"><slot /></button>' },
        'el-tag': { template: '<span><slot /></span>' },
        'el-tooltip': { template: '<div><slot /></div>' },
        'router-link': { props: ['to'], template: '<a><slot /></a>' },
        SequenceTimeline: { template: '<div />' },
        PromptCard: { template: '<div />' },
      },
    },
  })

describe('PromptDetail 顶栏：收藏/返回放在面包屑右侧', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mocks.getPrompt.mockResolvedValue({
      data: {
        id: 3,
        title: '当前提示词',
        content: '内容',
        type: 'single',
        status: 'published',
        chain: [],
        platformGroups: [],
        images: [],
        viewCount: 0,
        favoriteCount: 0,
      },
    })
    mocks.getRelated.mockResolvedValue({ data: [] })
  })

  it('收藏与返回按钮位于 detail-topline 容器内，与面包屑同行', async () => {
    const wrapper = mountPage()
    await nextTick()
    await nextTick()
    await nextTick()

    // 顶层 flex 容器存在
    const topline = wrapper.find('.detail-topline')
    expect(topline.exists()).toBe(true)

    // 面包屑在容器内
    expect(topline.find('.detail-breadcrumb').exists()).toBe(true)

    // 按钮组在容器内、紧跟面包屑（同一 flex 行的右侧）
    const actions = topline.find('.detail-topline-actions')
    expect(actions.exists()).toBe(true)
    const btns = actions.findAll('.stub-btn')
    expect(btns.length).toBe(2)

    // 旧的面板底部按钮区已移除
    expect(wrapper.find('.prompt-panel-foot').exists()).toBe(false)

    // DOM 顺序：面包屑在前，按钮组在后（flex space-between 使其分列两端）
    const children = topline.element.children
    expect(children[0].classList.contains('el-breadcrumb') || children[0].classList.contains('stub-breadcrumb')).toBe(true)
    expect(children[1].classList.contains('detail-topline-actions')).toBe(true)
  })
})
