import { describe, it, expect, vi } from 'vitest'
import { useDialog } from '@/composables/useDialog'

describe('useDialog', () => {
  const defaultForm = { name: '', age: 0 }

  it('初始状态：visible=false, loading=false, isEdit=false', () => {
    const dialog = useDialog({ defaultForm })
    expect(dialog.visible.value).toBe(false)
    expect(dialog.loading.value).toBe(false)
    expect(dialog.isEdit.value).toBe(false)
  })

  describe('openCreate', () => {
    it('打开对话框并设为创建模式', () => {
      const dialog = useDialog({ defaultForm })
      dialog.openCreate()
      expect(dialog.visible.value).toBe(true)
      expect(dialog.isEdit.value).toBe(false)
    })

    it('重置表单为默认值', () => {
      const dialog = useDialog({ defaultForm })
      dialog.form.name = '已修改'
      dialog.form.age = 99
      dialog.openCreate()
      expect(dialog.form.name).toBe('')
      expect(dialog.form.age).toBe(0)
    })

    it('支持 extraForm 覆盖默认值', () => {
      const dialog = useDialog({ defaultForm })
      dialog.openCreate({ name: '预设名' })
      expect(dialog.form.name).toBe('预设名')
      expect(dialog.form.age).toBe(0)
    })
  })

  describe('openEdit', () => {
    it('打开对话框并设为编辑模式', () => {
      const dialog = useDialog({ defaultForm })
      dialog.openEdit({ name: '编辑名', age: 25 })
      expect(dialog.visible.value).toBe(true)
      expect(dialog.isEdit.value).toBe(true)
    })

    it('填充编辑数据到表单', () => {
      const dialog = useDialog({ defaultForm })
      dialog.openEdit({ name: '编辑名', age: 25 })
      expect(dialog.form.name).toBe('编辑名')
      expect(dialog.form.age).toBe(25)
    })
  })

  describe('title', () => {
    it('创建模式标题为"新增"', () => {
      const dialog = useDialog({ defaultForm })
      dialog.openCreate()
      expect(dialog.title.value).toBe('新增')
    })

    it('编辑模式标题为"编辑"', () => {
      const dialog = useDialog({ defaultForm })
      dialog.openEdit({ name: 'test', age: 1 })
      expect(dialog.title.value).toBe('编辑')
    })
  })

  describe('close', () => {
    it('关闭对话框', () => {
      const dialog = useDialog({ defaultForm })
      dialog.openCreate()
      expect(dialog.visible.value).toBe(true)
      dialog.close()
      expect(dialog.visible.value).toBe(false)
    })

    it('触发 onCancel 回调', () => {
      const onCancel = vi.fn()
      const dialog = useDialog({ defaultForm, onCancel })
      dialog.openCreate()
      dialog.close()
      expect(onCancel).toHaveBeenCalledTimes(1)
    })
  })

  describe('confirm', () => {
    it('无 onConfirm 时直接关闭对话框', async () => {
      const dialog = useDialog({ defaultForm })
      dialog.openCreate()
      const result = await dialog.confirm()
      expect(result).toBe(true)
      expect(dialog.visible.value).toBe(false)
    })

    it('onConfirm 返回非 false 时关闭对话框', async () => {
      const onConfirm = vi.fn().mockResolvedValue(undefined)
      const dialog = useDialog({ defaultForm, onConfirm })
      dialog.openCreate()
      const result = await dialog.confirm()
      expect(result).toBe(true)
      expect(dialog.visible.value).toBe(false)
    })

    it('onConfirm 返回 false 时保持对话框打开', async () => {
      const onConfirm = vi.fn().mockResolvedValue(false)
      const dialog = useDialog({ defaultForm, onConfirm })
      dialog.openCreate()
      const result = await dialog.confirm()
      expect(result).toBe(false)
      expect(dialog.visible.value).toBe(true)
    })

    it('confirm 期间 loading 状态正确切换', async () => {
      let resolvePromise: (v: boolean) => void
      const onConfirm = vi.fn().mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            resolvePromise = resolve
          }),
      )
      const dialog = useDialog({ defaultForm, onConfirm })
      dialog.openCreate()

      const promise = dialog.confirm()
      expect(dialog.loading.value).toBe(true)

      resolvePromise!(true)
      await promise
      expect(dialog.loading.value).toBe(false)
    })

    it('onConfirm 抛异常时 loading 也应恢复', async () => {
      const onConfirm = vi.fn().mockRejectedValue(new Error('fail'))
      const dialog = useDialog({ defaultForm, onConfirm })
      dialog.openCreate()

      await expect(dialog.confirm()).rejects.toThrow('fail')
      expect(dialog.loading.value).toBe(false)
    })

    it('传递表单副本给 onConfirm', async () => {
      const onConfirm = vi.fn().mockResolvedValue(true)
      const dialog = useDialog({ defaultForm, onConfirm })
      dialog.openEdit({ name: '测试', age: 30 })
      await dialog.confirm()
      const formArg = onConfirm.mock.calls[0][0]
      expect(formArg).toEqual({ name: '测试', age: 30 })
      // 副本，非引用
      expect(formArg).not.toBe(dialog.form)
    })
  })

  describe('handleClosed', () => {
    it('触发 onClosed 回调', () => {
      const onClosed = vi.fn()
      const dialog = useDialog({ defaultForm, onClosed })
      dialog.handleClosed()
      expect(onClosed).toHaveBeenCalledTimes(1)
    })

    it('无 onClosed 时不报错', () => {
      const dialog = useDialog({ defaultForm })
      expect(() => dialog.handleClosed()).not.toThrow()
    })
  })

  describe('resetForm', () => {
    it('重置表单到默认值', () => {
      const dialog = useDialog({ defaultForm })
      dialog.form.name = '修改了'
      dialog.form.age = 99
      dialog.resetForm()
      expect(dialog.form.name).toBe('')
      expect(dialog.form.age).toBe(0)
    })
  })
})
