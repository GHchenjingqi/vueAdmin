import { defineConfig, devices } from '@playwright/test'

// 本地 E2E 运行辅助（untracked）：宿主 Chrome（channel）绕过 playwright chromium 下载（P5-T09 冒烟）。
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3103',
    trace: 'on-first-retry',
    channel: 'chrome',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
})
