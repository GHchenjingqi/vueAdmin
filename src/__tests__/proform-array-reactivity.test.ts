import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ProForm from '@/components/ProForm/index.vue'
import ProformArrayHost from './__fixtures__/ProformArrayHost.vue'

/** 复现 PromptManage 的绑定模式：SFC 中 v-model 绑定 script-setup 的 reactive 常量，外部对数组 push/splice */
describe('ProForm v-model 与外部数组变更', () => {
  it('外部 push 到 v-model 绑定的 reactive 数组后，列表应重新渲染', async () => {
    const wrapper = mount(ProformArrayHost)
    const vm = wrapper.vm as unknown as { form: { title: string; images: Array<{ url: string }> } }

    vm.form.images.push({ url: '/uploads/a.jpg' })
    await nextTick()

    expect(wrapper.find('.image-list').text()).toContain('/uploads/a.jpg')
  })

  it('外部 splice 后，列表应重新渲染', async () => {
    const wrapper = mount(ProformArrayHost)
    const vm = wrapper.vm as unknown as { form: { title: string; images: Array<{ url: string }> } }

    vm.form.images.push({ url: '/uploads/a.jpg' }, { url: '/uploads/b.jpg' })
    await nextTick()
    expect(wrapper.findAll('li').length).toBe(2)

    vm.form.images.splice(0, 1)
    await nextTick()
    expect(wrapper.findAll('li').length).toBe(1)
    expect(wrapper.find('.image-list').text()).not.toContain('/uploads/a.jpg')
  })

  it('先触发 ProForm emit，再外部 push，列表仍应重新渲染（复现线上 bug 顺序）', async () => {
    const wrapper = mount(ProformArrayHost)
    const vm = wrapper.vm as unknown as { form: { title: string; images: Array<{ url: string }> } }

    // 通过 ProForm 暴露的 setFieldsValue 触发真实 emit 链路（等价于用户输入）
    const proform = wrapper.findComponent(ProForm)
    await (proform.vm as unknown as { setFieldsValue: (v: Record<string, unknown>) => void }).setFieldsValue({ title: '先输入标题' })
    await nextTick()

    // 上传成功后 push（真实场景：handleUpload 里 form.images.push）
    vm.form.images.push({ url: '/uploads/after-emit.jpg' })
    await nextTick()
    await nextTick()

    expect(wrapper.find('.image-list').text()).toContain('/uploads/after-emit.jpg')
    expect(wrapper.findAll('li').length).toBe(1)
  })
})
