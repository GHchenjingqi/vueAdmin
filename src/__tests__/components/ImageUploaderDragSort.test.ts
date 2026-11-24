import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  portalApi: { uploadImage: vi.fn() },
  message: { error: vi.fn() },
}))

vi.mock('@/api', () => ({ portalApi: mocks.portalApi }))
vi.mock('@/utils/error', () => ({ getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)) }))
vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, ElMessage: mocks.message }
})

import ImageUploader from '@/views/portal/components/ImageUploader.vue'

const images = [
  { url: '/uploads/a.jpg', filePath: 'a', sort: 0, isCover: true },
  { url: '/uploads/b.jpg', filePath: 'b', sort: 1, isCover: false },
  { url: '/uploads/c.jpg', filePath: 'c', sort: 2, isCover: false },
]

const stub = (name?: string) => ({
  name,
  props: ['src', 'fit', 'previewSrcList', 'initialIndex', 'modelValue', 'max', 'httpRequest', 'beforeUpload', 'multiple', 'drag', 'disabled', 'draggable'],
  template: '<div class="stub"><slot /></div>',
})

const mountUploader = () =>
  mount(ImageUploader, {
    props: { modelValue: images, max: 20 },
    global: {
      stubs: {
        'el-upload': stub('ElUpload'),
        'el-image': stub('ElImage'),
        'el-tag': stub(),
        'el-button': stub(),
        'el-icon': stub(),
      },
    },
  })

describe('ImageUploader 拖拽排序', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. 拖拽图片后按新顺序发出更新，并重写 sort', async () => {
    const wrapper = mountUploader()
    const items = wrapper.findAll('.image-uploader-item')
    expect(items.length).toBe(3)

    await items[0].trigger('dragstart', { dataTransfer: { effectAllowed: '', setData: vi.fn() } })
    await items[2].trigger('dragover')
    await items[2].trigger('drop')
    await items[2].trigger('dragend')

    const emitted = wrapper.emitted('update:modelValue')![0][0] as typeof images
    expect(emitted.map((image) => image.url)).toEqual(['/uploads/b.jpg', '/uploads/c.jpg', '/uploads/a.jpg'])
    expect(emitted.map((image) => image.sort)).toEqual([0, 1, 2])
    // 封面标记跟随图片本身，不因排序改变
    expect(emitted[2].isCover).toBe(true)
  })

  it('2. 拖到原位不发出更新', async () => {
    const wrapper = mountUploader()
    const items = wrapper.findAll('.image-uploader-item')
    await items[1].trigger('dragstart', { dataTransfer: { effectAllowed: '', setData: vi.fn() } })
    await items[1].trigger('drop')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('3. 每张图片有序号标记，且图片本身禁用原生拖拽', () => {
    const wrapper = mountUploader()
    expect(wrapper.findAll('.image-uploader-order').map((node) => node.text())).toEqual(['1', '2', '3'])
    expect(wrapper.findAllComponents({ name: 'ElImage' }).every((node) => node.props('draggable') === false)).toBe(true)
  })
})
