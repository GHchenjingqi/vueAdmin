/**
 * aiApi 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/utils/request', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('aiApi', () => {
  it('getStatus() calls GET /ai/status', async () => {
    const { aiApi } = await import('@/api/ai')
    aiApi.getStatus()
    expect(mockGet).toHaveBeenCalledWith('/ai/status', { params: { _t: expect.any(Number) } })
  })

  it('chat() calls POST /ai/chat with timeout', async () => {
    const { aiApi } = await import('@/api/ai')
    const data = { message: 'hello', providerId: 1, model: 'gpt-4' }
    aiApi.chat(data)
    expect(mockPost).toHaveBeenCalledWith('/ai/chat', data, { timeout: 120000 })
  })

  it('chat() calls POST /ai/chat with minimal data', async () => {
    const { aiApi } = await import('@/api/ai')
    aiApi.chat({ message: 'hello' })
    expect(mockPost).toHaveBeenCalledWith('/ai/chat', { message: 'hello' }, { timeout: 120000 })
  })

  it('apply() calls POST /ai/apply', async () => {
    const { aiApi } = await import('@/api/ai')
    const files = [{ path: '/test.ts', content: 'code', language: 'ts', description: 'test', isNew: true }]
    aiApi.apply(files)
    expect(mockPost).toHaveBeenCalledWith('/ai/apply', { files })
  })

  it('rollback() calls POST /ai/apply with rollback flag', async () => {
    const { aiApi } = await import('@/api/ai')
    const files = [{ path: '/test.ts', content: 'code', language: 'ts', description: 'test', isNew: false }]
    aiApi.rollback(files)
    expect(mockPost).toHaveBeenCalledWith('/ai/apply', { files, rollback: true })
  })

  it('rebuildIndex() calls POST /ai/rebuild-index', async () => {
    const { aiApi } = await import('@/api/ai')
    aiApi.rebuildIndex()
    expect(mockPost).toHaveBeenCalledWith('/ai/rebuild-index')
  })

  describe('providers', () => {
    it('getProviders() calls GET /ai/providers with params', async () => {
      const { aiApi } = await import('@/api/ai')
      const params = { enabled: 1, keyword: 'openai' }
      aiApi.getProviders(params)
      expect(mockGet).toHaveBeenCalledWith('/ai/providers', { params })
    })

    it('getProviders() calls GET /ai/providers without params', async () => {
      const { aiApi } = await import('@/api/ai')
      aiApi.getProviders()
      expect(mockGet).toHaveBeenCalledWith('/ai/providers', { params: undefined })
    })

    it('getEnabledProviders() calls GET /ai/providers/enabled', async () => {
      const { aiApi } = await import('@/api/ai')
      aiApi.getEnabledProviders()
      expect(mockGet).toHaveBeenCalledWith('/ai/providers/enabled')
    })

    it('getProvider() calls GET /ai/providers/:id', async () => {
      const { aiApi } = await import('@/api/ai')
      aiApi.getProvider(1)
      expect(mockGet).toHaveBeenCalledWith('/ai/providers/1', { params: undefined })
    })

    it('getProvider() with includeKey calls GET /ai/providers/:id with includeKey param', async () => {
      const { aiApi } = await import('@/api/ai')
      aiApi.getProvider(1, true)
      expect(mockGet).toHaveBeenCalledWith('/ai/providers/1', { params: { includeKey: '1' } })
    })

    it('createProvider() calls POST /ai/providers', async () => {
      const { aiApi } = await import('@/api/ai')
      const data = {
        name: 'OpenAI',
        apiBaseUrl: 'https://api.openai.com',
        apiKey: 'sk-123',
        models: 'gpt-4',
        defaultModel: 'gpt-4',
      }
      aiApi.createProvider(data)
      expect(mockPost).toHaveBeenCalledWith('/ai/providers', data)
    })

    it('updateProvider() calls PUT /ai/providers/:id', async () => {
      const { aiApi } = await import('@/api/ai')
      const data = { name: 'Updated', enabled: 0 }
      aiApi.updateProvider(1, data)
      expect(mockPut).toHaveBeenCalledWith('/ai/providers/1', data)
    })

    it('deleteProvider() calls DELETE /ai/providers/:id', async () => {
      const { aiApi } = await import('@/api/ai')
      aiApi.deleteProvider(1)
      expect(mockDelete).toHaveBeenCalledWith('/ai/providers/1')
    })
  })
})
