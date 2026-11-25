import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const mocks = vi.hoisted(() => ({
  portalApi: { getPrompts: vi.fn() },
  promptApi: { getPrompts: vi.fn() },
}))

vi.mock('@/api', () => ({ portalApi: mocks.portalApi, promptApi: mocks.promptApi }))
vi.mock('@/utils/error', () => ({ getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)) }))

import CharacterPoseEditor from '@/views/portal/components/CharacterPoseEditor.vue'
import type { PromptCharacterPoseInput } from '@/api/prompt'

const emptyValue = (): PromptCharacterPoseInput => ({ characterImage: null, poses: [] })

const mountEditor = () =>
  mount(CharacterPoseEditor, {
    props: {
      modelValue: emptyValue(),
      platforms: [{ id: 1, name: '通用' }] as never,
    },
    global: {
      stubs: {
        'el-button': { template: '<button><slot /></button>' },
        'el-dialog': { template: '<div><slot /></div>' },
        'el-input': { template: '<input />' },
        'el-icon': { template: '<span><slot /></span>' },
        'el-image': { template: '<img />' },
        ImageUploader: {
          props: ['modelValue'],
          template: '<button class="stub-upload" @click="$emit(\'update:modelValue\', [{ url: \'/uploads/test.png\' }])">upload</button>',
        },
        PlatformImageGroups: {
          props: ['modelValue'],
          template:
            '<button class="stub-groups" @click="$emit(\'update:modelValue\', [{ platformId: 1, images: [{ url: \'/uploads/result.png\' }] }])">groups</button>',
        },
        ImagePickerDialog: {
          props: ['modelValue', 'scope'],
          template: "<button :class=\"'stub-picker-' + scope\" @click=\"$emit('select', { url: '/uploads/picked.png' })\">pick</button>",
        },
      },
    },
  })

describe('CharacterPoseEditor 角色+姿势组合', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.portalApi.getPrompts.mockResolvedValue({ data: { rows: [] } })
    mocks.promptApi.getPrompts.mockResolvedValue({ data: { rows: [] } })
  })

  it('1. 默认提供一个姿势槽位', async () => {
    const wrapper = mountEditor()
    await nextTick()
    expect(wrapper.findAll('.cp-pose').length).toBe(1)
  })

  it('2. 选择角色图与姿势图后写回表单', async () => {
    const wrapper = mountEditor()
    await nextTick()
    await wrapper.findAll('.stub-upload')[0].trigger('click')
    const poseLibraryButton = wrapper.findAll('button').find((button) => button.text() === '从姿势库选择')
    expect(poseLibraryButton).toBeTruthy()
    await poseLibraryButton!.trigger('click')
    await nextTick()
    await wrapper.find('.stub-picker-pose').trigger('click')
    await nextTick()
    const events = wrapper.emitted('update:modelValue') || []
    const emitted = events[events.length - 1]?.[0] as PromptCharacterPoseInput
    expect(emitted.characterImage?.url).toBe('/uploads/test.png')
    expect(emitted.poses[0].poseImage?.url).toBe('/uploads/picked.png')
  })

  it('3. 可为一个角色添加多个姿势', async () => {
    const wrapper = mountEditor()
    await wrapper.find('.cp-add').trigger('click')
    await nextTick()
    expect(wrapper.findAll('.cp-pose').length).toBe(2)
  })

  it('4. 生成图分组变化同步写回表单（回归：否则提交时报缺少生成图）', async () => {
    const wrapper = mountEditor()
    await nextTick()
    await wrapper.find('.stub-groups').trigger('click')
    await nextTick()
    const events = wrapper.emitted('update:modelValue') || []
    const emitted = events[events.length - 1]?.[0] as PromptCharacterPoseInput
    expect(emitted.poses[0].platformGroups[0].images[0].url).toBe('/uploads/result.png')
  })
})
