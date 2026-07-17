/**
 * 通用导出逻辑
 *
 * 封装文件导出（Excel/CSV）的下载逻辑，配合 Blob 响应使用
 */
import { ElMessage } from 'element-plus'

export interface UseExportOptions {
  exportFn?: (params: Record<string, unknown>) => Promise<Blob>
  filename?: string
  onSuccess?: () => void
  onError?: (err: Error) => void
}

export function useExport(options: UseExportOptions = {}) {
  const { exportFn, filename = '导出数据', onSuccess, onError } = options

  /**
   * 下载 Blob 文件
   */
  function downloadBlob(blob: Blob, name?: string): void {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', name || `${filename}.xlsx`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  /**
   * 执行导出
   */
  async function executeExport(params: Record<string, unknown> = {}): Promise<void> {
    if (!exportFn) {
      ElMessage.error('导出功能未配置')
      return
    }
    try {
      const blob = await exportFn(params)
      downloadBlob(blob)
      ElMessage.success('导出成功')
      onSuccess?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '导出失败'
      ElMessage.error(msg)
      onError?.(err as Error)
    }
  }

  /**
   * 导出当前页
   */
  async function exportCurrent(params: Record<string, unknown> = {}): Promise<void> {
    await executeExport(params)
  }

  return {
    executeExport,
    exportCurrent,
    downloadBlob,
  }
}
