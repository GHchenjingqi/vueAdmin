import ExcelJS from 'exceljs'

const DEFAULT_COLUMN_WIDTH = 16

export async function exportExcel({ columns, data, filename, sheetName = 'Sheet1' }) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)

  sheet.columns = columns.map((col) => ({
    header: col.label,
    key: col.prop,
    width: col.width || DEFAULT_COLUMN_WIDTH,
  }))

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, size: 12 }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8F0FE' },
  }
  headerRow.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  }

  data.forEach((row) => {
    sheet.addRow(row)
  })

  sheet.eachRow((row, rowNum) => {
    if (rowNum > 1) {
      row.alignment = { vertical: 'middle' }
    }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return { buffer, filename }
}