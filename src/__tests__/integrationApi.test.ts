import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()

vi.mock('@/utils/request', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AI 推送密钥 API', () => {
  it('getIntegrationKey() 读取密钥', async () => {
    const { promptApi } = await import('@/api/prompt')
    promptApi.getIntegrationKey()
    expect(mockGet).toHaveBeenCalledWith('/prompt/integrations/key')
  })

  it('rotateIntegrationKey() 轮换密钥', async () => {
    const { promptApi } = await import('@/api/prompt')
    promptApi.rotateIntegrationKey()
    expect(mockPost).toHaveBeenCalledWith('/prompt/integrations/key/rotate', {})
  })

  it('setIntegrationKeyStatus() 更新启用状态', async () => {
    const { promptApi } = await import('@/api/prompt')
    promptApi.setIntegrationKeyStatus(0)
    expect(mockPut).toHaveBeenCalledWith('/prompt/integrations/key/status', { status: 0 })
  })
})
