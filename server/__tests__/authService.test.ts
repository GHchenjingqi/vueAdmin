// @vitest-environment node
/**
 * authService 单元测试
 *
 * 覆盖纯逻辑函数（不依赖数据库连接的部分）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 在 import 前 mock 数据库依赖
vi.mock('../config/database.js', () => ({
  default: {
    literal: vi.fn((val: string) => val),
  },
}))

vi.mock('../models/User.js', () => ({
  default: {
    findOne: vi.fn(),
    findByPk: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}))

vi.mock('../models/RefreshToken.js', () => ({
  default: {
    findOne: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    destroy: vi.fn(),
    update: vi.fn(),
    generateToken: vi.fn(() => 'mock-refresh-token'),
  },
}))

vi.mock('../models/Setting.js', () => ({
  default: {
    findOne: vi.fn(),
  },
}))

vi.mock('../config/index.js', () => ({
  default: {
    jwt: { secret: 'test-secret-key-not-for-production' },
  },
}))

vi.mock('../utils/logger.js', () => ({
  logLogin: vi.fn(),
  logLoginFailure: vi.fn(),
  logOperation: vi.fn(),
}))

vi.mock('../utils/captcha.js', () => ({
  generate: vi.fn(() => ({ svg: '<svg/>', key: 'mock-key' })),
  verify: vi.fn(() => true),
}))

vi.mock('../middleware/rateLimiter.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, retryAfter: 0 })),
  recordAttempt: vi.fn(),
  clearAttempts: vi.fn(),
}))

vi.mock('../utils/onlineUsers.js', () => ({
  clearKickRecord: vi.fn(),
  isUserKicked: vi.fn(() => false),
}))

vi.mock('../models/UserRole.js', () => ({
  default: {
    findAll: vi.fn(),
  },
}))

vi.mock('../models/Role.js', () => ({
  default: {
    findAll: vi.fn(),
  },
}))

vi.mock('../models/RoleMenu.js', () => ({
  default: {
    findAll: vi.fn(),
  },
}))

vi.mock('../models/Menu.js', () => ({
  default: {
    findAll: vi.fn(),
  },
}))

const { validatePasswordStrength, createSseTicket, consumeSseTicket, getRefreshCookieConfig } = await import('../services/authService.js')

describe('validatePasswordStrength', () => {
  it('should reject empty password', () => {
    expect(validatePasswordStrength('')).toBe('密码长度不能少于8位')
    expect(validatePasswordStrength(null as any)).toBe('密码长度不能少于8位')
    expect(validatePasswordStrength(undefined as any)).toBe('密码长度不能少于8位')
  })

  it('should reject password shorter than 8 characters', () => {
    expect(validatePasswordStrength('Ab1!')).toBe('密码长度不能少于8位')
  })

  it('should reject password without uppercase letter', () => {
    expect(validatePasswordStrength('abcdefg1!')).toBe('密码必须包含至少一个大写字母')
  })

  it('should reject password without lowercase letter', () => {
    expect(validatePasswordStrength('ABCDEFG1!')).toBe('密码必须包含至少一个小写字母')
  })

  it('should reject password without digit', () => {
    expect(validatePasswordStrength('Abcdefgh!')).toBe('密码必须包含至少一个数字')
  })

  it('should reject password without special character', () => {
    expect(validatePasswordStrength('Abcdefg1')).toBe('密码必须包含至少一个特殊字符')
  })

  it('should accept valid strong passwords', () => {
    expect(validatePasswordStrength('Abcdefg1!')).toBeNull()
    expect(validatePasswordStrength('MyP@ssw0rd')).toBeNull()
    expect(validatePasswordStrength('C0mpl3x!ty#')).toBeNull()
    // 边界：刚好 8 位
    expect(validatePasswordStrength('Ab1!defg')).toBeNull()
  })
})

describe('SSE Ticket management', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should create and consume a valid ticket', async () => {
    const { ticket } = await createSseTicket(1, 'admin', '管理员')
    expect(ticket).toBeDefined()
    expect(ticket.length).toBeGreaterThan(0)

    const record = consumeSseTicket(ticket)
    expect(record).not.toBeNull()
    expect(record!.userId).toBe(1)
    expect(record!.username).toBe('admin')
  })

  it('should return null for non-existent ticket', () => {
    const record = consumeSseTicket('non-existent-ticket')
    expect(record).toBeNull()
  })

  it('should only allow one-time consumption', async () => {
    const { ticket } = await createSseTicket(1, 'admin', '管理员')

    // 第一次消费成功
    const first = consumeSseTicket(ticket)
    expect(first).not.toBeNull()

    // 第二次消费失败（已删除）
    const second = consumeSseTicket(ticket)
    expect(second).toBeNull()
  })

  it('should reject expired ticket', async () => {
    const { ticket } = await createSseTicket(1, 'admin', '管理员')

    // 前进 31 秒
    vi.advanceTimersByTime(31 * 1000)

    const record = consumeSseTicket(ticket)
    expect(record).toBeNull()
  })
})

describe('getRefreshCookieConfig', () => {
  it('should return cookie config with correct properties', () => {
    const config = getRefreshCookieConfig(7 * 24 * 60 * 60 * 1000)

    expect(config.httpOnly).toBe(true)
    expect(config.sameSite).toBe('strict')
    expect(config.path).toBe('/api')
    expect(config.maxAge).toBe(7 * 24 * 60 * 60 * 1000)
    expect(config.secure).toBe(false) // 非生产环境
  })

  it('should set secure flag in production', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    const config = getRefreshCookieConfig(3600000)
    expect(config.secure).toBe(true)

    process.env.NODE_ENV = originalEnv
  })
})