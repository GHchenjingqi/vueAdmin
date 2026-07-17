import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const existsSync = vi.fn()
  const readFileSync = vi.fn()
  const writeFileSync = vi.fn()
  const mkdirSync = vi.fn()
  const generate = vi.fn()

  return { existsSync, readFileSync, writeFileSync, mkdirSync, generate }
})

vi.mock('fs', () => ({
  default: {
    existsSync: mocks.existsSync,
    readFileSync: mocks.readFileSync,
    writeFileSync: mocks.writeFileSync,
    mkdirSync: mocks.mkdirSync,
  },
}))

vi.mock('selfsigned', () => ({
  default: {
    generate: mocks.generate,
  },
}))

describe('generateCert - getOrCreateCert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('证书已存在时从磁盘读取', async () => {
    mocks.existsSync.mockReturnValue(true)
    mocks.readFileSync
      .mockReturnValueOnce('private-key-content')
      .mockReturnValueOnce('cert-content')

    const { getOrCreateCert } = await import('../utils/generateCert')
    const result = await getOrCreateCert()

    expect(result.key).toBe('private-key-content')
    expect(result.cert).toBe('cert-content')
    expect(mocks.existsSync).toHaveBeenCalledTimes(2)
    expect(mocks.readFileSync).toHaveBeenCalledTimes(2)
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('证书不存在时生成新证书并保存', async () => {
    mocks.existsSync.mockReturnValue(false)
    mocks.generate.mockResolvedValue({
      private: 'generated-private-key',
      cert: 'generated-cert',
      fingerprint: 'abc123',
    })

    const { getOrCreateCert } = await import('../utils/generateCert')
    const result = await getOrCreateCert()

    expect(result.key).toBe('generated-private-key')
    expect(result.cert).toBe('generated-cert')
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(mocks.mkdirSync).toHaveBeenCalledTimes(1)
    expect(mocks.writeFileSync).toHaveBeenCalledTimes(2)
    expect(mocks.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('server.key'),
      'generated-private-key',
      'utf-8',
    )
    expect(mocks.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('server.crt'),
      'generated-cert',
      'utf-8',
    )
  })

  it('只有 key 文件存在时也生成新证书', async () => {
    mocks.existsSync
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
    mocks.generate.mockResolvedValue({
      private: 'new-private',
      cert: 'new-cert',
      fingerprint: 'def456',
    })

    const { getOrCreateCert } = await import('../utils/generateCert')
    const result = await getOrCreateCert()

    expect(result.key).toBe('new-private')
    expect(result.cert).toBe('new-cert')
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })

  it('只有 cert 文件存在时也生成新证书', async () => {
    mocks.existsSync
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    mocks.generate.mockResolvedValue({
      private: 'new-private-2',
      cert: 'new-cert-2',
      fingerprint: 'ghi789',
    })

    const { getOrCreateCert } = await import('../utils/generateCert')
    const result = await getOrCreateCert()

    expect(result.key).toBe('new-private-2')
    expect(result.cert).toBe('new-cert-2')
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })

  it('证书目录不存在时先创建目录', async () => {
    mocks.existsSync.mockReturnValue(false)
    mocks.generate.mockResolvedValue({
      private: 'pk',
      cert: 'crt',
      fingerprint: 'fp',
    })

    const { getOrCreateCert } = await import('../utils/generateCert')
    await getOrCreateCert()

    expect(mocks.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.cert'),
      { recursive: true },
    )
  })

  it('generate 传递正确的参数', async () => {
    mocks.existsSync.mockReturnValue(false)
    mocks.generate.mockResolvedValue({
      private: 'pk',
      cert: 'crt',
      fingerprint: 'fp',
    })

    const { getOrCreateCert } = await import('../utils/generateCert')
    await getOrCreateCert()

    const callArgs = mocks.generate.mock.calls[0] as [unknown[], Record<string, unknown>]
    const attrs = callArgs[0]
    const options = callArgs[1]

    expect(attrs).toEqual([{ name: 'commonName', value: '192.168.12.251' }])
    expect(options.days).toBe(365)
    expect(options.keySize).toBe(2048)
    expect(options.algorithm).toBe('sha256')
    expect(options.extensions[0].name).toBe('subjectAltName')
    expect(options.extensions[0].altNames).toHaveLength(3)
  })
})