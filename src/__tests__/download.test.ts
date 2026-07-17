/**
 * download.ts 单元测试
 * 使用 jsdom 环境模拟浏览器 DOM API
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadBlob } from '../utils/download'

describe('download.ts', () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>
  let appendChildSpy: ReturnType<typeof vi.spyOn>
  let removeChildSpy: ReturnType<typeof vi.spyOn>
  let clickSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clickSpy = vi.fn()
    createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      setAttribute: vi.fn(),
      click: clickSpy,
    } as any)

    appendChildSpy = vi.spyOn(document.body, 'appendChild').mockReturnValue({} as any)
    removeChildSpy = vi.spyOn(document.body, 'removeChild').mockReturnValue({} as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('创建 a 标签并触发下载', () => {
    const blob = new Blob(['test content'], { type: 'text/plain' })
    downloadBlob(blob, 'test.txt')

    expect(createElementSpy).toHaveBeenCalledWith('a')
    expect(appendChildSpy).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(removeChildSpy).toHaveBeenCalled()
  })

  it('不同文件名和类型都能处理', () => {
    const jsonBlob = new Blob(['{"key":"value"}'], { type: 'application/json' })
    downloadBlob(jsonBlob, 'data.json')

    expect(createElementSpy).toHaveBeenCalledWith('a')
    expect(clickSpy).toHaveBeenCalled()
  })
})
