import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useExport } from '@/composables/useExport'

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('useExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('executeExport', () => {
    it('无 exportFn 时显示错误', async () => {
      const { ElMessage } = await import('element-plus')
      const exporter = useExport({})
      await exporter.executeExport()

      expect(ElMessage.error).toHaveBeenCalledWith('导出功能未配置')
    })

    it('成功导出', async () => {
      const { ElMessage } = await import('element-plus')
      const mockBlob = new Blob(['test'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const exportFn = vi.fn().mockResolvedValue(mockBlob)
      const onSuccess = vi.fn()

      const exporter = useExport({ exportFn, filename: '测试导出', onSuccess })
      await exporter.executeExport({ page: 1 })

      expect(exportFn).toHaveBeenCalledWith({ page: 1 })
      expect(ElMessage.success).toHaveBeenCalledWith('导出成功')
      expect(onSuccess).toHaveBeenCalled()
    })

    it('导出失败时显示错误', async () => {
      const { ElMessage } = await import('element-plus')
      const exportFn = vi.fn().mockRejectedValue(new Error('导出失败'))
      const onError = vi.fn()

      const exporter = useExport({ exportFn, onError })
      await exporter.executeExport()

      expect(ElMessage.error).toHaveBeenCalledWith('导出失败')
      expect(onError).toHaveBeenCalled()
    })
  })

  describe('downloadBlob', () => {
    it('使用默认文件名', async () => {
      const mockBlob = new Blob(['data'], { type: 'text/csv' })
      const exportFn = vi.fn().mockResolvedValue(mockBlob)

      const createObjectURL = vi.fn().mockReturnValue('blob:test')
      const revokeObjectURL = vi.fn()
      globalThis.URL.createObjectURL = createObjectURL
      globalThis.URL.revokeObjectURL = revokeObjectURL

      const exporter = useExport({ exportFn })
      await exporter.executeExport()

      expect(createObjectURL).toHaveBeenCalledWith(mockBlob)
    })
  })
})
