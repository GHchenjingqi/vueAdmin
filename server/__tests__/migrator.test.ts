// @vitest-environment node
/**
 * migrator 单元测试
 * 测试 Umzug 迁移/种子执行器配置
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQueryInterface = { createTable: vi.fn(), dropTable: vi.fn() }
const mockSequelize = {
  getQueryInterface: vi.fn().mockReturnValue(mockQueryInterface),
  define: vi.fn(),
}

const mockUmzugAdd = vi.fn()
const mockUmzugUp = vi.fn().mockResolvedValue([{ name: 'test-migration' }])
const mockUmzugDown = vi.fn().mockResolvedValue([{ name: 'test-migration' }])
const mockUmzugPending = vi.fn().mockResolvedValue([])
const mockUmzugExecuted = vi.fn().mockResolvedValue([])

class MockUmzug {
  constructor(opts: any) {
    this.options = opts
  }
  options: any
  up = mockUmzugUp
  down = mockUmzugDown
  pending = mockUmzugPending
  executed = mockUmzugExecuted
}

class MockSequelizeStorage {
  sequelize: any
  modelName: string
  constructor(opts: any) {
    this.sequelize = opts?.sequelize
    this.modelName = opts?.modelName
  }
}

vi.mock('umzug', () => ({
  Umzug: MockUmzug,
  SequelizeStorage: MockSequelizeStorage,
}))

vi.mock('../config/database.js', () => ({
  default: mockSequelize,
}))

vi.mock('../utils/fileLogger.js', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}))

const { migrator, seeder } = await import('../utils/migrator.js')

describe('migrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should be an Umzug instance', () => {
    expect(migrator).toBeInstanceOf(MockUmzug)
  })

  it('should have migrations glob pointing to server/migrations', () => {
    const glob: string = migrator.options.migrations.glob
    expect(glob).toContain('migrations')
    expect(glob).toContain('.ts')
  })

  it('should have context set to sequelize query interface', () => {
    expect(migrator.options.context).toBe(mockQueryInterface)
  })

  it('should have SequelizeMeta storage', () => {
    expect(migrator.options.storage).toBeDefined()
    expect(migrator.options.storage.modelName).toBe('SequelizeMeta')
  })

  it('should resolve migration with up and down functions', () => {
    const resolve = migrator.options.migrations.resolve
    const result = resolve({
      name: 'test-migration',
      path: '/fake/path/migration.ts',
      context: mockQueryInterface,
    })

    expect(result.name).toBe('test-migration')
    expect(typeof result.up).toBe('function')
    expect(typeof result.down).toBe('function')
  })

  it('should have logger configured', () => {
    expect(migrator.options.logger).toBeDefined()
    expect(typeof migrator.options.logger.info).toBe('function')
    expect(typeof migrator.options.logger.warn).toBe('function')
    expect(typeof migrator.options.logger.error).toBe('function')
  })

  it('should call logger.info with string message', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    migrator.options.logger.info('Migration started')
    migrator.options.logger.warn('Warning message')
    expect(consoleSpy).toHaveBeenCalledWith('[Migration] Warning message')
    consoleSpy.mockRestore()
  })
})

describe('seeder', () => {
  it('should be an Umzug instance', () => {
    expect(seeder).toBeInstanceOf(MockUmzug)
  })

  it('should have migrations glob pointing to server/seeders', () => {
    const glob: string = seeder.options.migrations.glob
    expect(glob).toContain('seeders')
    expect(glob).toContain('.ts')
  })

  it('should have SeederMeta storage', () => {
    expect(seeder.options.storage).toBeDefined()
    expect(seeder.options.storage.modelName).toBe('SeederMeta')
  })

  it('should resolve seeder with up and down functions', () => {
    const resolve = seeder.options.migrations.resolve
    const result = resolve({
      name: 'test-seeder',
      path: '/fake/path/seeder.ts',
      context: mockQueryInterface,
    })

    expect(result.name).toBe('test-seeder')
    expect(typeof result.up).toBe('function')
    expect(typeof result.down).toBe('function')
  })

  it('should have seeder logger configured', () => {
    expect(seeder.options.logger).toBeDefined()
    expect(typeof seeder.options.logger.info).toBe('function')
    expect(typeof seeder.options.logger.warn).toBe('function')
    expect(typeof seeder.options.logger.error).toBe('function')
  })
})