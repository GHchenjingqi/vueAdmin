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

const chain = [
  { id: 1, title: '上游提示词A', content: '内容A' },
  { id: 2, title: '上游提示词B', content: '内容B' },
  { id: 3, title: '当前提示词', content: '内容C' },
]

const mountPage = () =>
  mount(PromptDetail, {
    global: {
      stubs: {
        'el-breadcrumb': { template: '<div><slot /></div>' },
        'el-breadcrumb-item': { template: '<span><slot /></span>' },
        'el-icon': { template: '<span><slot /></span>' },
        'el-image': { template: '<div />' },
        'el-button': { template: '<button><slot /></button>' },
        'router-link': {
          props: ['to'],
          template: '<a class="router-link-stub" :data-to="JSON.stringify(to)"><slot /></a>',
        },
        SequenceTimeline: { template: '<div />' },
        PromptCard: { template: '<div />' },
      },
    },
  })

describe('PromptDetail 派生链节点', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mocks.getPrompt.mockResolvedValue({
      data: {
        id: 3,
        title: '当前提示词',
        content: '内容C',
        type: 'single',
        status: 'published',
        chain,
        platformGroups: [],
        images: [],
        viewCount: 0,
        favoriteCount: 0,
      },
    })
    mocks.getRelated.mockResolvedValue({ data: [] })
  })

  it('非当前节点显示「上游」标签并可跳转到对应详情，当前节点显示「当前」且不可跳转', async () => {
    const wrapper = mountPage()
    await nextTick()
    await nextTick()
    await nextTick()

    const nodes = wrapper.findAll('.chain-node')
    expect(nodes).toHaveLength(3)

    // 上游标签数量 = 非当前节点数 = 2
    expect(wrapper.findAll('.chain-node-upstream-tag')).toHaveLength(2)
    // 当前标签数量 = 1
    expect(wrapper.findAll('.chain-node-current-tag')).toHaveLength(1)
    // 可跳转节点数量 = 2
    const links = wrapper.findAll('.chain-node-link')
    expect(links).toHaveLength(2)
    // 跳转目标为对应 id
    const tos = links.map((l) => l.attributes('data-to'))
    expect(tos.some((t) => t && t.includes('/portal/prompts/1'))).toBe(true)
    expect(tos.some((t) => t && t.includes('/portal/prompts/2'))).toBe(true)
  })
})
