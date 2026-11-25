import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  message: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
  portalSkills: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, ElMessage: mocks.message }
})

vi.mock('@/api', () => ({
  skillApi: {
    getPortalSkills: mocks.portalSkills,
    attachmentDownloadUrl: (skillId: number, attachmentId: string) => `/api/v1/portal/skills/${skillId}/attachments/${attachmentId}/download`,
  },
}))

import SkillSquare from '@/views/portal/SkillSquare.vue'

const sample = {
  id: 7,
  title: '分镜生成技能包',
  description: '用于短剧分镜生成，包含提示词模板与参数说明。',
  attachments: [
    { id: 'f1.md', url: '/uploads/f1.md', name: 'README.md', size: 2048, mimetype: 'text/markdown' },
    { id: 'f2.zip', url: '/uploads/f2.zip', name: 'templates.zip', size: 1048576, mimetype: 'application/zip' },
  ],
  status: 1,
  viewCount: 12,
  createdAt: '2026-11-25T00:00:00.000Z',
  updatedAt: '2026-11-25T00:00:00.000Z',
}

const mountPage = () =>
  mount(SkillSquare, {
    global: {
      stubs: {
        'el-icon': { template: '<span><slot /></span>' },
        'el-button': { template: '<button><slot /></button>' },
        'el-empty': { template: '<div class="stub-empty" />' },
      },
    },
  })

describe('前台 Skills 下载页', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.portalSkills.mockResolvedValue({ data: { rows: [sample], total: 1, page: 1, pageSize: 12 } })
  })

  it('1. 展示标题与使用说明', async () => {
    const wrapper = mountPage()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
    const text = wrapper.text()
    expect(text).toContain('分镜生成技能包')
    expect(text).toContain('用于短剧分镜生成')
  })

  it('2. 每个附件渲染为下载直链，保留原始文件名', async () => {
    const wrapper = mountPage()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
    const links = wrapper.findAll('a.skill-download-item')
    expect(links).toHaveLength(2)
    expect(links[0].attributes('href')).toBe('/api/v1/portal/skills/7/attachments/f1.md/download')
    expect(links[0].text()).toContain('README.md')
    expect(links[0].attributes('download')).toBe('README.md')
    expect(links[1].text()).toContain('1.0 MB')
  })

  it('3. 空列表时显示空状态', async () => {
    mocks.portalSkills.mockResolvedValueOnce({ data: { rows: [], total: 0, page: 1, pageSize: 12 } })
    const wrapper = mountPage()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.stub-empty').exists()).toBe(true)
  })
})
