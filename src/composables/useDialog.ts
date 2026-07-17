/**
 * 通用弹窗逻辑
 *
 * 封装对话框的打开/关闭/确认/取消逻辑
 * 可配合 FormDialog 使用，也可独立使用
 */
import { ref, reactive, computed } from 'vue'

export interface UseDialogOptions<T = Record<string, unknown>> {
  defaultForm: T
  onConfirm?: (form: T) => Promise<boolean | void>
  onCancel?: () => void
  onClosed?: () => void
}

export function useDialog<T extends Record<string, unknown>>(options: UseDialogOptions<T>) {
  const { defaultForm, onConfirm, onCancel, onClosed } = options

  const visible = ref(false)
  const loading = ref(false)
  const isEdit = ref(false)
  const form = reactive({ ...defaultForm }) as T

  /**
   * 打开对话框（创建模式）
   */
  function openCreate(extraForm?: Partial<T>): void {
    isEdit.value = false
    Object.assign(form, { ...defaultForm }, extraForm)
    visible.value = true
  }

  /**
   * 打开对话框（编辑模式）
   */
  function openEdit(data: T): void {
    isEdit.value = true
    Object.assign(form, { ...data })
    visible.value = true
  }

  /**
   * 关闭对话框
   */
  function close(): void {
    visible.value = false
    onCancel?.()
  }

  /**
   * 确认回调
   */
  async function confirm(): Promise<boolean> {
    if (!onConfirm) {
      visible.value = false
      return true
    }
    loading.value = true
    try {
      const result = await onConfirm({ ...form } as T)
      if (result !== false) {
        visible.value = false
        return true
      }
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * 对话框关闭后重置
   */
  function handleClosed(): void {
    onClosed?.()
  }

  /**
   * 重置表单到默认值
   */
  function resetForm(): void {
    Object.assign(form, { ...defaultForm })
  }

  const title = computed(() => (isEdit.value ? '编辑' : '新增'))

  return {
    visible,
    loading,
    isEdit,
    form,
    title,
    openCreate,
    openEdit,
    close,
    confirm,
    handleClosed,
    resetForm,
  }
}
