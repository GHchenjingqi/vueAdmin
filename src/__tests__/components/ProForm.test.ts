import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ProForm from '@/components/ProForm/index.vue'

// Element Plus 组件直接注册为全局 stubs，避免模板解析警告
const elementStubs = {
  ElForm: { template: '<div class="el-form"><slot /></div>' },
  ElFormItem: { template: '<div class="el-form-item"><slot /></div>' },
  ElInput: { template: '<input class="el-input" />' },
  ElSelect: { template: '<div class="el-select"><slot /></div>' },
  ElOption: { template: '<div class="el-option" />' },
  ElButton: { template: '<button class="el-button"><slot /></button>' },
  ElRow: { template: '<div class="el-row"><slot /></div>' },
  ElCol: { template: '<div class="el-col"><slot /></div>' },
  ElDivider: { template: '<div class="el-divider"><slot /></div>' },
}

describe('ProForm', () => {
  const pinia = createPinia()

  function createWrapper(props: Record<string, unknown>) {
    return mount(ProForm, {
      props: {
        schema: [],
        showActions: false,
        ...props,
      },
      global: {
        plugins: [pinia],
        stubs: {
          ...elementStubs,
          ProFormItem: {
            name: 'ProFormItem',
            template: '<div class="pro-form-item"><slot /></div>',
            props: ['item', 'modelValue'],
          },
        },
      },
      attachTo: document.body,
    })
  }

  const baseSchema = [
    { prop: 'name', label: '名称', type: 'input', defaultValue: '' },
    { prop: 'email', label: '邮箱', type: 'input', defaultValue: '' },
    { prop: 'status', label: '状态', type: 'select', defaultValue: 1 },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('根据 schema 渲染所有表单项', () => {
    const wrapper = createWrapper({
      schema: baseSchema,
      showActions: false,
    })
    // ProFormItem 应该是可见的
    expect(wrapper.findAllComponents({ name: 'ProFormItem' }).length).toBe(3)
  })

  it('支持通过 modelValue 传递初始值', () => {
    const modelValue = { name: 'test user', email: 'test@example.com', status: 0 }
    const wrapper = createWrapper({
      schema: baseSchema,
      modelValue,
      showActions: false,
    })
    expect(wrapper.vm.formData.name).toBe('test user')
    expect(wrapper.vm.formData.email).toBe('test@example.com')
  })

  it('hidden 为 true 时隐藏表单项', () => {
    const schema = [
      { prop: 'name', label: '名称', type: 'input' },
      { prop: 'hiddenField', label: '隐藏字段', type: 'input', hidden: true },
    ]
    const wrapper = createWrapper({
      schema,
      showActions: false,
    })
    const vm = wrapper.vm as unknown as { visibleSchema: { prop: string }[]; formData: Record<string, unknown> }
    expect(vm.visibleSchema.length).toBe(1)
    expect(vm.visibleSchema[0].prop).toBe('name')
  })

  it('hidden 支持动态函数', () => {
    const schema = [
      { prop: 'type', label: '类型', type: 'input' },
      {
        prop: 'dynamicField',
        label: '动态字段',
        type: 'input',
        hidden: (model: Record<string, unknown>) => model.type !== 'special',
      },
    ]
    const wrapper = createWrapper({
      schema,
      modelValue: { type: 'normal' },
      showActions: false,
    })
    const vm2 = wrapper.vm as unknown as { visibleSchema: { prop: string }[] }
    expect(vm2.visibleSchema.length).toBe(1)
  })

  it('不显示操作按钮当 showActions 为 false', () => {
    const wrapper = createWrapper({
      schema: baseSchema,
      showActions: false,
    })
    expect(wrapper.find('.pro-form__actions').exists()).toBe(false)
  })

  it('显示操作按钮当 showActions 为 true', () => {
    const wrapper = createWrapper({
      schema: baseSchema,
      showActions: true,
    })
    expect(wrapper.find('.pro-form__actions').exists()).toBe(true)
  })

  it('设置默认值当 schema 有 defaultValue', () => {
    const schema = [{ prop: 'name', label: '名称', type: 'input', defaultValue: 'default name' }]
    const wrapper = createWrapper({
      schema,
      showActions: false,
    })
    expect(wrapper.vm.formData.name).toBe('default name')
  })

  it('调用 update:modelValue 当表单数据变化', async () => {
    const schema = [{ prop: 'name', label: '名称', type: 'input', defaultValue: '' }]
    const wrapper = createWrapper({
      schema,
      showActions: false,
    })

    // 直接修改 formData 应该触发 emit
    wrapper.vm.formData.name = 'new name'
    await wrapper.vm.$nextTick()

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1][0]).toHaveProperty('name', 'new name')
  })

  it('表单项禁用当 disabled 为 true', () => {
    const wrapper = createWrapper({
      schema: baseSchema,
      disabled: true,
      showActions: false,
    })
    expect(wrapper.props().disabled).toBe(true)
  })
})
