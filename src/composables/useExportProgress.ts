/**
 * 导出进度追踪
 *
 * 用于大数据量导出时显示进度条提示
 */
import { ref, readonly } from 'vue'

export function useExportProgress() {
  const exporting = ref(false)
  const progress = ref(0)
  const total = ref(0)
  const current = ref(0)
  const statusText = ref('')

  const percent = ref(0)

  function start(totalCount: number, text?: string): void {
    exporting.value = true
    progress.value = 0
    total.value = totalCount
    current.value = 0
    percent.value = 0
    statusText.value = text || '正在导出数据...'
  }

  function update(completed: number): void {
    current.value = completed
    if (total.value > 0) {
      percent.value = Math.round((completed / total.value) * 100)
    }
    statusText.value = `正在导出 ${completed} / ${total.value} 条数据...`
  }

  function finish(): void {
    exporting.value = false
    percent.value = 100
    statusText.value = '导出完成'
    setTimeout(() => {
      progress.value = 0
      total.value = 0
      current.value = 0
      percent.value = 0
      statusText.value = ''
    }, 2000)
  }

  function fail(msg?: string): void {
    exporting.value = false
    statusText.value = msg || '导出失败'
    setTimeout(() => {
      statusText.value = ''
      percent.value = 0
    }, 3000)
  }

  return {
    exporting: readonly(exporting),
    percent: readonly(percent),
    statusText: readonly(statusText),
    start,
    update,
    finish,
    fail,
  }
}
