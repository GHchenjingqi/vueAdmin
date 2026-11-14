import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.spec.ts'],
    // P4-T08 安全修复回归：mock/bnpl 回调验签要求配置独立密钥。测试环境注入一个
    // 非默认的真实密钥，使既有 mock webhook 契约（signWebhook ↔ verifyAndParse）仍成立；
    // 生产/未配置环境则 fail-closed 拒绝默认密钥，杜绝伪造。
    env: { PAYMENT_WEBHOOK_SECRET: 'vitest_webhook_secret_xyz' },
  },
})
