import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAddRow = vi.fn()
const mockGetRow = vi.fn()
const mockEachRow = vi.fn()
const mockWriteBuffer = vi.fn()

const mockSheet = {
  columns: [] as Array<{ header: string; key: string; width: number }>,
  addRow: mockAddRow,
  getRow: mockGetRow,
  eachRow: mockEachRow,
}

const mockAddWorksheet = vi.fn().mockReturnValue(mockSheet)

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class MockWorkbook {
  addWorksheet = mockAddWorksheet
  xlsx = { writeBuffer: mockWriteBuffer }
}

vi.mock('exceljs', () => ({
  default: {
    Workbook: MockWorkbook,
  },
}))

const { exportExcel } = await import('../utils/exportExcel')

describe('exportExcel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSheet.columns = []

    const mockHeaderRow = {
      font: {},
      alignment: {},
      fill: {},
      border: {},
    }
    mockGetRow.mockReturnValue(mockHeaderRow)
    mockWriteBuffer.mockResolvedValue(Buffer.from('excel-data'))
  })

  it('基本导出：创建 workbook 并生成 buffer', async () => {
    const columns = [{ label: '姓名', prop: 'name', width: 20 }]
    const data = [{ name: 'Alice' }, { name: 'Bob' }]

    const result = await exportExcel({ columns, data, filename: 'users.xlsx' })

    expect(mockAddWorksheet).toHaveBeenCalledWith('Sheet1')
    expect(result.buffer).toBeInstanceOf(Buffer)
    expect(result.filename).toBe('users.xlsx')
  })

  it('自定义 sheetName', async () => {
    const columns = [{ label: '姓名', prop: 'name' }]
    const data = [{ name: 'Alice' }]

    await exportExcel({
      columns,
      data,
      filename: 'users.xlsx',
      sheetName: '用户列表',
    })

    expect(mockAddWorksheet).toHaveBeenCalledWith('用户列表')
  })

  it('未指定 sheetName 时默认使用 Sheet1', async () => {
    const columns = [{ label: '姓名', prop: 'name' }]
    const data = [{ name: 'Alice' }]

    await exportExcel({ columns, data, filename: 'test.xlsx' })

    expect(mockAddWorksheet).toHaveBeenCalledWith('Sheet1')
  })

  it('列未指定 width 时使用默认宽度 16', async () => {
    const columns = [{ label: '姓名', prop: 'name' }]
    const data = [{ name: 'Alice' }]

    await exportExcel({ columns, data, filename: 'test.xlsx' })

    expect(mockSheet.columns).toEqual([
      { header: '姓名', key: 'name', width: 16 },
    ])
  })

  it('列指定 width 时使用自定义宽度', async () => {
    const columns = [{ label: '姓名', prop: 'name', width: 30 }]
    const data = [{ name: 'Alice' }]

    await exportExcel({ columns, data, filename: 'test.xlsx' })

    expect(mockSheet.columns).toEqual([
      { header: '姓名', key: 'name', width: 30 },
    ])
  })

  it('多列导出', async () => {
    const columns = [
      { label: '姓名', prop: 'name', width: 20 },
      { label: '年龄', prop: 'age' },
      { label: '邮箱', prop: 'email', width: 30 },
    ]
    const data = [
      { name: 'Alice', age: 25, email: 'alice@example.com' },
    ]

    await exportExcel({ columns, data, filename: 'test.xlsx' })

    expect(mockSheet.columns).toHaveLength(3)
    expect(mockSheet.columns[0]).toEqual({ header: '姓名', key: 'name', width: 20 })
    expect(mockSheet.columns[1]).toEqual({ header: '年龄', key: 'age', width: 16 })
    expect(mockSheet.columns[2]).toEqual({ header: '邮箱', key: 'email', width: 30 })
  })

  it('设置表头样式', async () => {
    const columns = [{ label: '姓名', prop: 'name' }]
    const data = [{ name: 'Alice' }]

    await exportExcel({ columns, data, filename: 'test.xlsx' })

    const headerRow = mockGetRow.mock.results[0].value as Record<string, unknown>
    expect(headerRow.font).toEqual({ bold: true, size: 12 })
    expect(headerRow.alignment).toEqual({ horizontal: 'center', vertical: 'middle' })
    expect(headerRow.fill).toEqual({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F0FE' },
    })
    expect(headerRow.border).toEqual({
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    })
  })

  it('数据行逐行添加', async () => {
    const columns = [{ label: '姓名', prop: 'name' }]
    const data = [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }]

    await exportExcel({ columns, data, filename: 'test.xlsx' })

    expect(mockAddRow).toHaveBeenCalledTimes(3)
    expect(mockAddRow).toHaveBeenCalledWith({ name: 'Alice' })
    expect(mockAddRow).toHaveBeenCalledWith({ name: 'Bob' })
    expect(mockAddRow).toHaveBeenCalledWith({ name: 'Charlie' })
  })

  it('空数据导出', async () => {
    const columns = [{ label: '姓名', prop: 'name' }]
    const data: Record<string, unknown>[] = []

    await exportExcel({ columns, data, filename: 'test.xlsx' })

    expect(mockAddRow).not.toHaveBeenCalled()
    expect(mockWriteBuffer).toHaveBeenCalledTimes(1)
  })

  it('eachRow 为数据行设置样式', async () => {
    const columns = [{ label: '姓名', prop: 'name' }]
    const data = [{ name: 'Alice' }]

    mockEachRow.mockImplementation((callback: (row: { alignment: Record<string, string> }, rowNum: number) => void) => {
      callback({ alignment: {} }, 1)
      callback({ alignment: {} }, 2)
    })

    await exportExcel({ columns, data, filename: 'test.xlsx' })

    expect(mockEachRow).toHaveBeenCalledTimes(1)
  })

  it('writeBuffer 返回正确的 buffer', async () => {
    const columns = [{ label: '姓名', prop: 'name' }]
    const data = [{ name: 'Alice' }]
    const expectedBuffer = Buffer.from('test-excel-buffer')
    mockWriteBuffer.mockResolvedValue(expectedBuffer)

    const result = await exportExcel({ columns, data, filename: 'test.xlsx' })

    expect(result.buffer).toBe(expectedBuffer)
  })
})