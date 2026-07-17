import { describe, it, expect, vi } from 'vitest'

const { mockMdEditorConfig } = vi.hoisted(() => ({
  mockMdEditorConfig: vi.fn(),
}))

vi.mock('md-editor-v3', () => ({
  config: mockMdEditorConfig,
}))

vi.mock('highlight.js', () => ({
  default: { highlight: vi.fn() },
}))

vi.mock('katex', () => ({
  default: { render: vi.fn() },
}))

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn() },
}))

vi.mock('echarts', () => ({
  default: {},
}))

import { setupMdEditor } from '@/utils/mdEditorSetup'

describe('mdEditorSetup', () => {
  describe('setupMdEditor', () => {
    it('第一次调用执行配置', () => {
      setupMdEditor()

      expect(mockMdEditorConfig).toHaveBeenCalledTimes(1)
      expect(mockMdEditorConfig).toHaveBeenCalledWith({
        editorExtensions: expect.objectContaining({
          highlight: expect.any(Object),
          katex: expect.any(Object),
          mermaid: expect.any(Object),
        }),
      })
    })

    it('第二次调用不重复执行配置', () => {
      mockMdEditorConfig.mockClear()

      setupMdEditor()

      expect(mockMdEditorConfig).not.toHaveBeenCalled()
    })
  })
})
