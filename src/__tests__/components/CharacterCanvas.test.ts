import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import CharacterCanvas from '@/views/portal/components/CharacterCanvas.vue'
import type { PromptCharacterLibrary } from '@/api/prompt'

const lib: PromptCharacterLibrary = {
  turnarounds: [{ url: '/uploads/turn.png' }],
  costumes: [{ url: '/uploads/costume.png' }],
  hairstyles: [{ url: '/uploads/hairstyle.png' }],
  expressions: [{ url: '/uploads/expression.png' }],
  props: [{ url: '/uploads/prop.png' }],
}

const mountCanvas = (value: PromptCharacterLibrary = lib) =>
  mount(CharacterCanvas, {
    props: { value },
    global: {
      stubs: {
        'el-button': { template: '<button class="stub-button"><slot /></button>' },
        'el-image': { template: '<img class="stub-image" />' },
        'el-icon': { template: '<span class="stub-icon" />' },
      },
    },
  })

describe('角色库无限画布', () => {
  it('1. 按 角色/服装/发饰/表情/道具 顺序渲染五组，且每组图片完整', () => {
    const wrapper = mountCanvas()
    const text = wrapper.text()
    const labels = ['角色三视图', '服装三视图', '发饰特写', '面部表情', '道具图']
    const order = labels.map((label) => text.indexOf(label))
    expect(order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1]))).toBe(true)
    expect(wrapper.findAll('.group-image')).toHaveLength(5)
  })

  it('2. 主视觉取角色三视图第一张', () => {
    const wrapper = mountCanvas()
    expect(wrapper.find('.hero-image').exists()).toBe(true)
  })

  it('3. 数量为 0 的分组不渲染，只显示有图的分组', () => {
    const partial: PromptCharacterLibrary = {
      turnarounds: [{ url: '/uploads/turn.png' }],
      costumes: [{ url: '/uploads/costume.png' }],
      hairstyles: [],
      expressions: [],
      props: [],
    }
    const wrapper = mountCanvas(partial)
    expect(wrapper.findAll('.group-row')).toHaveLength(2)
    const text = wrapper.text()
    expect(text).toContain('角色三视图')
    expect(text).toContain('服装三视图')
    expect(text).not.toContain('发饰特写')
    expect(text).not.toContain('面部表情')
    expect(text).not.toContain('道具图')
  })

  it('4. 全空数据时显示空态，不渲染画布内容', () => {
    const empty: PromptCharacterLibrary = { turnarounds: [], costumes: [], hairstyles: [], expressions: [], props: [] }
    const wrapper = mountCanvas(empty)
    expect(wrapper.find('.canvas-empty').exists()).toBe(true)
    expect(wrapper.find('.canvas-surface').exists()).toBe(false)
  })

  it('5. 点击全屏按钮切换到返回按钮，再点击退出', async () => {
    const wrapper = mountCanvas()
    const toolbar = wrapper.find('.canvas-toolbar')
    expect(toolbar.text()).toContain('全屏查看')
    await toolbar.find('button').trigger('click')
    expect(wrapper.find('.canvas-viewport').classes()).toContain('is-fullscreen')
    expect(toolbar.text()).toContain('返回')
    await toolbar.find('button').trigger('click')
    expect(wrapper.find('.canvas-viewport').classes()).not.toContain('is-fullscreen')
  })

  it('6. 提供放大/缩小/复位三个缩放控件', () => {
    const wrapper = mountCanvas()
    expect(wrapper.findAll('.canvas-controls button')).toHaveLength(3)
  })
})
