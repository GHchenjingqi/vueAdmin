// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { marked } from 'marked'

describe('public site - renderMarkdown', () => {
  it('渲染标题、加粗、链接、图片', () => {
    const html = marked.parse('# 标题\n\n这是**加粗**与 [链接](https://example.com)\n\n![图](https://a.b/c.png)')
    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<strong>加粗</strong>')
    expect(html).toContain('<a href="https://example.com">链接</a>')
    expect(html).toContain('<img src="https://a.b/c.png" alt="图"')
  })

  it('空字符串渲染为空', () => {
    expect(marked.parse('')).toBe('')
  })
})
