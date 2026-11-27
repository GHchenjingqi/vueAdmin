import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  message: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, ElMessage: mocks.message }
})

import CharacterLibraryEditor from '@/views/portal/components/CharacterLibraryEditor.vue'
import type { PromptCharacterLibraryInput } from '@/api/prompt'

const stubUploader = { template: '<div class="stub-uploader" />' }

const mountEditor = (value?: Partial<PromptCharacterLibraryInput>) =>
  mount(CharacterLibraryEditor, {
    props: {
      modelValue: { turnarounds: [], costumes: [], hairstyles: [], props: [], expressions: [], ...value },
      source: 'admin',
    },
    global: {
      stubs: {
        ImageUploader: stubUploader,
        ImagePickerDialog: { template: '<div class="stub-picker" />' },
        'el-button': { template: '<button class="stub-button"><slot /></button>', emits: ['click'] },
        'el-image': { template: '<img class="stub-image" />' },
        'el-tabs': { template: '<div class="stub-tabs"><slot /></div>' },
        'el-tab-pane': { props: ['name', 'label'], template: '<div class="stub-pane"><slot name="label" /><slot /></div>' },
      },
    },
  })

describe('角色库编辑器', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. 渲染五组资产：三视图/服装/发型/道具/面部表情', () => {
    const wrapper = mountEditor()
    const text = wrapper.text()
    expect(text).toContain('角色三视图')
    expect(text).toContain('服装三视图')
    expect(text).toContain('发型特写')
    expect(text).toContain('道具图')
    expect(text).toContain('面部表情')
  })

  it('2. 更新组图片时 emit 完整五组结构', async () => {
    const wrapper = mountEditor()
    const vm = wrapper.vm as unknown as { updateGroup: (key: string, images: Array<{ url: string; filePath?: string | null }>) => void }
    vm.updateGroup('turnarounds', [{ url: '/uploads/a.png', filePath: null }])
    const emitted = wrapper.emitted('update:modelValue')?.slice(-1)[0]?.[0] as PromptCharacterLibraryInput
    expect(emitted.turnarounds).toEqual([{ url: '/uploads/a.png', filePath: null }])
    expect(emitted.costumes).toEqual([])
    expect(emitted.hairstyles).toEqual([])
    expect(emitted.props).toEqual([])
    expect(emitted.expressions).toEqual([])
  })

  it('3. 面部表情组：上传图片 emit 到 expressions 字段', async () => {
    const wrapper = mountEditor()
    const vm = wrapper.vm as unknown as { updateGroup: (key: string, images: Array<{ url: string; filePath?: string | null }>) => void }
    vm.updateGroup('expressions', [{ url: '/uploads/face.png', filePath: null }])
    const emitted = wrapper.emitted('update:modelValue')?.slice(-1)[0]?.[0] as PromptCharacterLibraryInput
    expect(emitted.expressions).toEqual([{ url: '/uploads/face.png', filePath: null }])
    expect(emitted.turnarounds).toEqual([])
  })

  it('4. 图库选择去重：同一 URL 不重复追加', async () => {
    const wrapper = mountEditor({ costumes: [{ url: '/uploads/b.png' }] })
    const vm = wrapper.vm as unknown as {
      openPicker: (key: string) => void
      onPickImage: (image: { url: string; filePath?: string | null }) => void
    }
    vm.openPicker('costumes')
    vm.onPickImage({ url: '/uploads/b.png' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    vm.onPickImage({ url: '/uploads/c.png' })
    const emitted = wrapper.emitted('update:modelValue')?.slice(-1)[0]?.[0] as PromptCharacterLibraryInput
    expect(emitted.costumes).toHaveLength(2)
  })
})
