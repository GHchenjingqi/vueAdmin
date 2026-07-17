import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * 覆盖率目标说明（诚实渐进式）：
 * 基线约 47%（2026-07-10）。当前阈值按可达成的渐进目标配置，长期目标 80%。
 * 已在 2026-07-17 补充 request.ts 拦截器、errors.ts 单测，消除 error.ts 重导出假阴性。
 * 如需本地快速验证且暂不关心覆盖率，使用 `npm run test:fast`。
 */
export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      dts: false,
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'server/shared'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'forks',
    server: {
      deps: {
        inline: ['element-plus', '@element-plus/icons-vue'],
      },
    },
    include: ['src/__tests__/**/*.test.ts', 'server/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
      include: [
        'src/utils/**',
        'src/composables/**',
        'src/i18n/**',
        'src/stores/**',
        'src/api/**',
        'server/utils/**',
        'server/middleware/**',
      ],
      exclude: [
        'src/main.ts',
        'src/App.vue',
        'src/**/*.d.ts',
        'src/__tests__/**',
        'server/__tests__/**',
        // 重导出文件（仅为类型兼容，无逻辑，真实实现见 errors.ts）
        'src/i18n/zh-CN.ts',
        'src/i18n/en-US.ts',
        'src/utils/error.ts',
      ],
      // 覆盖率目标（诚实渐进式）：
      // 基线约 47%（2026-07-10）。2026-07-17 已补充 request.ts 拦截器与 errors.ts 测试，
      // 消除 error.ts 重导出假阴性。阈值为当前可达成的渐进目标，长期目标 80%。
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 60,
        lines: 70,
      },
    },
  },
})