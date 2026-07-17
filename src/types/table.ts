export interface TableColumn {
  prop: string
  label: string
  width?: number
  minWidth?: number
  maxWidth?: number
  sortable?: boolean
  /** 固定列位置，支持 boolean | 'left' | 'right' */
  fixed?: boolean | 'left' | 'right' | string
  /** 对齐方式 */
  align?: string
  children?: TableColumn[]
  formatter?: (row: Record<string, unknown>, column: Record<string, unknown>) => string | number
  alwaysShow?: boolean
  defaultShow?: boolean
  resizable?: boolean
  showOverflowTooltip?: boolean
}
