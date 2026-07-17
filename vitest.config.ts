import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * 覆盖率目标说明：
 * 当前基线约为 47%（2026-07-10）。Coverage Threshold 设置为 80%，
 * 这是我们追求的长期目标。Phase 3（P3）阶段会专项补充单元测试以接近该目标。
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
        // 重导出文件（仅为类型兼容，无逻辑）
        'src/i18n/zh-CN.ts',
        'src/i18n/en-US.ts',
      ],
      // 覆盖率目标（渐进式）：
      // Phase 3.5 (2026-07-10): 63% — 当前可达成的基线
      // Phase 4: 68% — 补充 request.ts/themeStore 测试
      // 最终: 80% — 完整覆盖所有业务逻辑
      thresholds: {
        statements: 63,
        branches: 55,
        functions: 55,
        lines: 63,
      },
    },
  },
})