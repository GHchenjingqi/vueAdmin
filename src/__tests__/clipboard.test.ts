import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { copyText } from '@/utils/clipboard'

describe('copyText', () => {
  const originalClipboard = navigator.clipboard

  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard })
    document.body.innerHTML = ''
  })

  it('使用 navigator.clipboard 当可用时', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await copyText('hello')
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('回退到 textarea + execCommand 当 clipboard 不可用时', async () => {
    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand
    await copyText('world')
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(document.body.querySelector('textarea')).toBeNull()
  })

  it('复制失败时抛出错误', async () => {
    document.execCommand = vi.fn().mockReturnValue(false)
    await expect(copyText('fail')).rejects.toThrow('copy failed')
  })
})
