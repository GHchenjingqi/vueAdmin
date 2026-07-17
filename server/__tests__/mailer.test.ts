import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockCreateTransport = vi.fn()

vi.mock('nodemailer', () => ({
  default: {
    createTransport: mockCreateTransport,
  },
}))

describe('mailer', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('SMTP_HOST 未配置时 transporter 为 null', async () => {
    delete process.env.SMTP_HOST

    const { default: transporter } = await import('../utils/mailer')

    expect(transporter).toBeNull()
    expect(mockCreateTransport).not.toHaveBeenCalled()
  })

  it('SMTP_HOST 配置时创建 transporter', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_PORT = '587'
    process.env.SMTP_SECURE = 'false'
    process.env.SMTP_USER = 'test@example.com'
    process.env.SMTP_PASS = 'password123'

    const mockTransporter = { sendMail: vi.fn() }
    mockCreateTransport.mockReturnValue(mockTransporter)

    const { default: transporter } = await import('../utils/mailer')

    expect(transporter).toBe(mockTransporter)
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: {
        user: 'test@example.com',
        pass: 'password123',
      },
    })
  })

  it('SMTP_PORT 未配置时默认使用 587', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    delete process.env.SMTP_PORT

    const mockTransporter = { sendMail: vi.fn() }
    mockCreateTransport.mockReturnValue(mockTransporter)

    const { default: transporter } = await import('../utils/mailer')

    expect(transporter).toBe(mockTransporter)
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587 }),
    )
  })

  it('SMTP_SECURE 为 true 时使用安全连接', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_SECURE = 'true'

    const mockTransporter = { sendMail: vi.fn() }
    mockCreateTransport.mockReturnValue(mockTransporter)

    const { default: transporter } = await import('../utils/mailer')

    expect(transporter).toBe(mockTransporter)
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true }),
    )
  })

  it('SMTP_PORT 解析失败时默认使用 587', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_PORT = 'invalid'

    const mockTransporter = { sendMail: vi.fn() }
    mockCreateTransport.mockReturnValue(mockTransporter)

    const { default: transporter } = await import('../utils/mailer')

    expect(transporter).toBe(mockTransporter)
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587 }),
    )
  })

  it('SMTP_PORT 为有效数值时正确解析', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_PORT = '465'

    const mockTransporter = { sendMail: vi.fn() }
    mockCreateTransport.mockReturnValue(mockTransporter)

    const { default: transporter } = await import('../utils/mailer')

    expect(transporter).toBe(mockTransporter)
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465 }),
    )
  })
})