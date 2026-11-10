import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindAll = vi.fn()
const mockCreate = vi.fn()
const mockFindOne = vi.fn()

vi.mock('../modules/shop/models/index.js', () => ({
  ShopBanner: {
    findAll: (...a: unknown[]) => mockFindAll(...a),
    create: (...a: unknown[]) => mockCreate(...a),
    findOne: (...a: unknown[]) => mockFindOne(...a),
  },
}))

vi.mock('../tenant/context.js', () => ({
  getTenantContext: () => ({ tenantId: 1 }),
}))

const { listBanners, createBanner, updateBanner, deleteBanner } = await import('../modules/storefront/services/bannerService.js')

const makeRow = (over: Record<string, unknown> = {}) => ({
  id: 1,
  position: 'hero',
  title: 'Test',
  subtitle: null,
  linkUrl: '/c/test',
  buttonLabel: 'Shop',
  image: 'https://example.com/b.jpg',
  sortOrder: 0,
  startAt: null,
  endAt: null,
  update: vi.fn(),
  destroy: vi.fn(),
  ...over,
})

const site = { tenantId: 1, channelId: null, shopId: 0, defaultCurrency: 'USD', defaultLocale: 'en-US' }

beforeEach(() => { vi.clearAllMocks() })

describe('bannerService', () => {
  describe('listBanners', () => {
    it('过滤 enabled=true 并返回列表', async () => {
      mockFindAll.mockResolvedValue([makeRow()])
      const res = await listBanners(site, { position: 'hero' })
      expect(res).toHaveLength(1)
      expect(mockFindAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 1, siteId: 0, enabled: true, position: 'hero' }),
        }),
      )
    })

    it('过滤时段外的 banner（startAt 在未来）', async () => {
      const future = new Date(Date.now() + 86400000)
      mockFindAll.mockResolvedValue([makeRow({ startAt: future })])
      const res = await listBanners(site)
      expect(res).toHaveLength(0)
    })

    it('过滤已过期的 banner（endAt 在过去）', async () => {
      const past = new Date(Date.now() - 86400000)
      mockFindAll.mockResolvedValue([makeRow({ endAt: past })])
      const res = await listBanners(site)
      expect(res).toHaveLength(0)
    })

    it('时段内的 banner 正常返回', async () => {
      const past = new Date(Date.now() - 86400000)
      const future = new Date(Date.now() + 86400000)
      mockFindAll.mockResolvedValue([makeRow({ startAt: past, endAt: future })])
      const res = await listBanners(site)
      expect(res).toHaveLength(1)
    })
  })

  describe('createBanner', () => {
    it('创建 banner 并返回 id', async () => {
      const row = makeRow()
      mockCreate.mockResolvedValue(row)
      const res = await createBanner(site, { title: 'New', image: 'https://x.com/i.jpg' })
      expect(res.id).toBe(1)
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 1, siteId: 0, title: 'New', image: 'https://x.com/i.jpg' }),
      )
    })
  })

  describe('updateBanner', () => {
    it('更新并返回 id', async () => {
      const row = makeRow()
      mockFindOne.mockResolvedValue(row)
      const res = await updateBanner(site, 1, { title: 'Updated' })
      expect(res.id).toBe(1)
      expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ title: 'Updated' }))
    })

    it('banner 不存在时抛 404', async () => {
      mockFindOne.mockResolvedValue(null)
      await expect(updateBanner(site, 99, { title: 'X' })).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  describe('deleteBanner', () => {
    it('删除并返回 id', async () => {
      const row = makeRow()
      mockFindOne.mockResolvedValue(row)
      const res = await deleteBanner(site, 1)
      expect(res.id).toBe(1)
      expect(row.destroy).toHaveBeenCalled()
    })
  })
})
