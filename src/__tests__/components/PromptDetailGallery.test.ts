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
        'el-empty': { template: '<div />' },
        'el-breadcrumb': { template: '<div class="stub-breadcrumb"><slot /></div>' },
        'el-breadcrumb-item': { template: '<span><slot /></span>' },
        'el-icon': { template: '<span><slot /></span>' },
        'el-image': { template: '<div class="stub-image"><slot /></div>' },
        'el-button': { template: '<button class="stub-btn"><slot /></button>' },
        'el-tag': { template: '<span><slot /></span>' },
        'el-tooltip': { template: '<div><slot /></div>' },
        'router-link': { props: ['to'], template: '<a><slot /></a>' },
        SequenceTimeline: { template: '<div />' },
        PromptCard: { template: '<div />' },
      },
      directives: { loading: {} },
    },
  })

const multiImages = [
  { id: 1, url: '/a.png', platformId: 1, sort: 0 },
  { id: 2, url: '/b.png', platformId: 1, sort: 1 },
  { id: 3, url: '/c.png', platformId: 1, sort: 2 },
]

describe('PromptDetail 图片展示：主图自适应 + 缩略图悬浮右侧竖排', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mocks.getPrompt.mockResolvedValue({
      data: {
        id: 3,
        title: '测试',
        content: '内容',
        type: 'single',
        status: 'published',
        chain: [],
        platformGroups: [],
        images: multiImages,
        viewCount: 0,
        favoriteCount: 0,
      },
    })
    mocks.getRelated.mockResolvedValue({ data: [] })
  })

  it('缩略图导航位于 gallery-frame 内部，与图片同容器', async () => {
    const wrapper = mountPage()
    await nextTick()
    await nextTick()
    await nextTick()

    const frame = wrapper.find('.gallery-frame')
    expect(frame.exists()).toBe(true)
    expect(frame.find('.detail-main-image').exists() || frame.find('.stub-image').exists()).toBe(true)
    expect(frame.findAll('.detail-thumb').length).toBe(3)
    // 缩略图不再是 frame 的兄弟节点
    expect(wrapper.find('.detail-gallery > .detail-thumbs').exists()).toBe(false)
  })
})
