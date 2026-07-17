/**
 * md-editor-v3 全局配置（懒加载）
 *
 * 原实现在 `main.ts` 启动阶段同步导入 md-editor 全家桶
 * （highlight.js / katex / mermaid / echarts）并调用 `config()`，
 * 导致 ~670KB（Brotli）的 `vendor-md` chunk 以及 ~300KB 的
 * `vendor-echarts` chunk 被强制拉入首屏。
 *
 * 现改为首次使用 `MdEditor` / `MdPreview` 时按需加载，
 * 首屏不再包含 Markdown 编辑器相关代码。
 */
import { config as mdEditorConfig } from 'md-editor-v3'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import mermaid from 'mermaid'
import * as echarts from 'echarts'

let configured = false

/** 配置 md-editor-v3 的扩展（幂等，仅执行一次） */
export function setupMdEditor(): void {
  if (configured) return
  configured = true
  mdEditorConfig({
    editorExtensions: {
      highlight: { instance: hljs },
      katex: { instance: katex },
      mermaid: { instance: mermaid },
      echarts: { instance: echarts },
    },
  })
}
