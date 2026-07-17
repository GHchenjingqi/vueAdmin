import { describe, it, expect } from 'vitest'
import { sanitizeSvg } from '@/utils/sanitize'

describe('sanitizeSvg', () => {
  describe('sanitizeSvg', () => {
    it('空字符串返回空字符串', () => {
      expect(sanitizeSvg('')).toBe('')
    })

    it('正常 SVG 不受影响', () => {
      const svg = '<svg><circle cx="50" cy="50" r="40"/></svg>'
      expect(sanitizeSvg(svg)).toBe(svg)
    })

    it('移除 script 标签', () => {
      const svg = '<svg><script>alert("xss")</script><circle/></svg>'
      const result = sanitizeSvg(svg)
      expect(result).not.toContain('script')
      expect(result).toContain('<circle')
    })

    it('移除 script 标签含属性', () => {
      const svg = '<svg><script type="text/javascript">evil()</script><rect/></svg>'
      const result = sanitizeSvg(svg)
      expect(result).not.toContain('script')
      expect(result).toContain('<rect')
    })

    it('移除 onclick 事件属性', () => {
      const svg = '<svg><circle onclick="alert(1)" cx="50"/></svg>'
      const result = sanitizeSvg(svg)
      expect(result).not.toContain('onclick')
      expect(result).toContain('cx="50"')
    })

    it('移除 onload 事件属性', () => {
      const svg = '<svg onload="alert(1)"><circle/></svg>'
      const result = sanitizeSvg(svg)
      expect(result).not.toContain('onload')
    })

    it('移除 onerror 事件属性', () => {
      const svg = '<svg><image onerror="alert(1)"/></svg>'
      const result = sanitizeSvg(svg)
      expect(result).not.toContain('onerror')
    })

    it('移除 javascript: 协议的 href', () => {
      const svg = '<svg><a href="javascript:alert(1)">click</a></svg>'
      const result = sanitizeSvg(svg)
      expect(result).not.toContain('javascript:')
    })

    it('移除 javascript: 协议的 xlink:href', () => {
      const svg = '<svg><use xlink:href="javascript:alert(1)"/></svg>'
      const result = sanitizeSvg(svg)
      expect(result).not.toContain('javascript:')
    })

    it('保留正常 href', () => {
      const svg = '<svg><a href="https://example.com">link</a></svg>'
      const result = sanitizeSvg(svg)
      expect(result).toContain('https://example.com')
    })

    it('移除多个危险属性', () => {
      const svg = '<svg onload="a()"><script>x()</script><circle onclick="b()" onmouseover="c()"/></svg>'
      const result = sanitizeSvg(svg)
      expect(result).not.toContain('script')
      expect(result).not.toContain('onload')
      expect(result).not.toContain('onclick')
      expect(result).not.toContain('onmouseover')
      expect(result).toContain('<circle')
    })
  })
})
