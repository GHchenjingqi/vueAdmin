import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readdirSync, existsSync } from 'fs'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import viteCompression from 'vite-plugin-compression'
import { visualizer } from 'rollup-plugin-visualizer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** 自动扫描 element-plus 的所有组件 style 路径，避免 Vite 在运行时发现新依赖触发 reload */
function getElementPlusStyleIncludes(): string[] {
  const epDir = resolve(__dirname, 'node_modules/element-plus/es/components')
  if (!existsSync(epDir)) return []
  return readdirSync(epDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `element-plus/es/components/${d.name}/style/index`)
}

export default defineConfig({
  plugins: [
    vue(),
    // 自动导入 Vue 组合式 API 和 Element Plus API
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      // sass 模式：Element Plus 组件样式从 Sass 源文件按需导入
      resolvers: [ElementPlusResolver({ importStyle: 'sass' })],
      dts: './auto-imports.d.ts',
    }),
    // 自动导入 Element Plus 组件（按需加载 + 按需 CSS）
    // importStyle: 'sass' — 从 theme-chalk Sass 源文件按需导入 CSS，节省 ~450KB
    Components({
      resolvers: [
        ElementPlusResolver({ importStyle: 'sass' }),
        // 图标自动按需加载
        IconsResolver({ prefix: 'icon' }),
      ],
      dts: './components.d.ts',
    }),
    // 图标自动按需加载
    Icons({ autoInstall: true }),
    // Bundle 可视化分析（仅 ANALYZE=true 模式激活）
    visualizer({
      filename: 'bundle-report/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    }),
    // 生产构建时生成压缩文件，配合 Express gzip_static / brotli_static
    viteCompression({
      verbose: true,
      disable: false,
      threshold: 10240,
      // Gzip 压缩
      algorithm: 'gzip',
      ext: '.gz',
    }),
    // Brotli 压缩（比 Gzip 压缩率高约 20%）
    viteCompression({
      verbose: true,
      disable: false,
      threshold: 10240,
      algorithm: 'brotliCompress',
      ext: '.br',
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'server/shared'),
    },
  },
  optimizeDeps: {
    include: ['element-plus/es', ...getElementPlusStyleIncludes()],
  },
  build: {
    // 开启 CSS 代码分割
    cssCodeSplit: true,
    // 禁用生产环境 sourcemap
    sourcemap: false,
    // 目标浏览器兼容
    target: 'es2015',
    // 开启压缩
    minify: 'esbuild',
    // 首屏仅预载关键 vendor，按需大 chunk（md-editor / echarts / highlight）
    // 不预载，等真正使用时（打开通知详情 / 进入图表页 / AI 生成代码）再按需 fetch
    modulePreload: {
      resolveDependencies: (_chunk, deps) =>
        deps.filter(
          (d) =>
            !/(vendor-echarts|vendor-highlight|mdEditorSetup|md-editor-v3|katex|mermaid|highlight\.js)/.test(
              d,
            ),
        ),
    },
    rollupOptions: {
      output: {
        // 函数式分包：稳定核心库做成 manual chunk；md-editor / katex / mermaid 等按需大库
        // 交回 Rollup 自动拆分，避免被 entry 动态图引用后提升为全站静态公共依赖
        // （对象式 {'vendor-md':[...]} 曾导致 vendor-md 被挂到所有懒视图的静态依赖图）
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](vue|vue-router|pinia|vue-i18n)[\\/]/.test(id)) return 'vendor-vue'
          if (/[\\/]node_modules[\\/](element-plus|@element-plus[\\/]icons-vue)[\\/]/.test(id))
            return 'vendor-element'
          if (/[\\/]node_modules[\\/]@sentry[\\/]/.test(id)) return 'vendor-sentry'
          if (/[\\/]node_modules[\\/](axios|zod|sortablejs|nprogress)[\\/]/.test(id))
            return 'vendor-utils'
          // echarts / highlight 仅被动态引用（图表页 / AI 生成代码），独立分包不影响首屏
          if (/[\\/]node_modules[\\/]echarts[\\/]/.test(id)) return 'vendor-echarts'
          if (/[\\/]node_modules[\\/]highlight\.js[\\/]/.test(id)) return 'vendor-highlight'
          return undefined
        },
        // Chunk 文件命名规则，包含 hash 用于缓存
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern',
      },
    },
  },
  server: {
    port: 5174,
    host: '0.0.0.0',
    // 允许通过局域网 IP（如 192.168.x.x）访问时的 WebSocket HMR 连接
    // 覆盖 Vite 在 HTTPS 模式下注入的默认 CSP，允许当前源的 WebSocket 连接
    headers: {
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:24678 ws://127.0.0.1:24678 wss://*:* ws://*:*; img-src 'self' data: blob:; font-src 'self' data:;",
    },
    // 开发环境代理：将 /api 请求转发到后端（后端在 5173）
    proxy: {
      '/api': {
        target: 'https://localhost:5173',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'https://localhost:5173',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
