import { defineConfig, devices } from '@playwright/test'

/**
 * E2E 冒烟配置（P1-T13）：unit 与 smoke e2e 在 CI 必跑；
 * 本地无浏览器下载环境时，用例与配置先行落盘，运行验证随 CI 环境执行。
 */
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
