import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useExportProgress } from '@/composables/useExportProgress'

describe('useExportProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('初始状态', () => {
    const progress = useExportProgress()
    expect(progress.exporting.value).toBe(false)
    expect(progress.percent.value).toBe(0)
    expect(progress.statusText.value).toBe('')
  })

  describe('start', () => {
    it('设置导出状态', () => {
      const progress = useExportProgress()
      progress.start(100, '开始导出')

      expect(progress.exporting.value).toBe(true)
      expect(progress.statusText.value).toBe('开始导出')
    })

    it('默认状态文本', () => {
      const progress = useExportProgress()
      progress.start(50)

      expect(progress.statusText.value).toBe('正在导出数据...')
    })
  })

  describe('update', () => {
    it('更新进度', () => {
      const progress = useExportProgress()
      progress.start(100)
      progress.update(50)

      expect(progress.percent.value).toBe(50)
      expect(progress.statusText.value).toBe('正在导出 50 / 100 条数据...')
    })

    it('total 为 0 时不计算百分比', () => {
      const progress = useExportProgress()
      progress.start(0)
      progress.update(10)

      expect(progress.percent.value).toBe(0)
    })
  })

  describe('finish', () => {
    it('完成导出', () => {
      const progress = useExportProgress()
      progress.start(100)
      progress.finish()

      expect(progress.exporting.value).toBe(false)
      expect(progress.percent.value).toBe(100)
      expect(progress.statusText.value).toBe('导出完成')
    })

    it('2 秒后重置状态', () => {
      const progress = useExportProgress()
      progress.start(100)
      progress.finish()

      vi.advanceTimersByTime(2000)

      expect(progress.percent.value).toBe(0)
      expect(progress.statusText.value).toBe('')
    })
  })

  describe('fail', () => {
    it('导出失败', () => {
      const progress = useExportProgress()
      progress.start(100)
      progress.fail('导出出错')

      expect(progress.exporting.value).toBe(false)
      expect(progress.statusText.value).toBe('导出出错')
    })

    it('默认错误消息', () => {
      const progress = useExportProgress()
      progress.start(100)
      progress.fail()

      expect(progress.statusText.value).toBe('导出失败')
    })
  })
})
