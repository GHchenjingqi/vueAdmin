/**
 * 文件日志写入模块
 *
 * fs 依赖通过模块级变量注入，测试时可通过 setFsClient() 替换。
 * 生产环境使用原生 fs，生产代码无需任何改动。
 */
import * as _fsReal from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 日志目录
const LOG_DIR = resolve(__dirname, '../logs')

// 日志保留天数
const RETENTION_DAYS = 30

// ===== 可注入的 fs 客户端（测试时替换） =====
let _fs: typeof _fsReal = _fsReal
let _statSync = _fs.statSync
let _unlinkSync = _fs.unlinkSync

// 防抖状态（对象引用避免 TDZ 问题）
const _cleanState = { cleanedToday: false }
/**
 * 替换 fs 实现（测试用）
 *
 * 使用方式：
 * ```ts
 * import { setFsClient } from './fileLogger'
 * setFsClient({ appendFileSync: mockFn, ... })
 * ```
 */
export function setFsClient(fsClient: Partial<typeof _fs>) {
  _fs = Object.assign({}, _fsReal, fsClient)
  // 同步函数单独维护引用
  if ('statSync' in fsClient) _statSync = fsClient.statSync!
  if ('unlinkSync' in fsClient) _unlinkSync = fsClient.unlinkSync!
}

/** 恢复原生 fs（测试 cleanup）*/
export function resetFsClient() {
  _fs = _fsReal
  _statSync = _fs.statSync
  _unlinkSync = _fs.unlinkSync
}

/** 重置每日清理标志（测试用）*/
export function resetCleanedToday() {
  _cleanState.cleanedToday = false
}

/** 读取每日清理状态（测试用） */
export function getCleanedTodayState(): boolean {
  return _cleanState.cleanedToday
}

/** 导出 fs 调用追踪（测试用）*/
export interface FsCalls {
  appendFileSync: Array<[path: string, content: string, encoding: string]>
  readdirSync: Array<[path: string]>
  statSync: Array<[path: string]>
  unlinkSync: Array<[path: string]>
}

/**
 * 获取 fs 调用追踪（测试用）
 * 必须在调用 setFsClient(trackingFsClient(calls)) 之后调用此函数。
 */
export function trackingFsClient(calls: FsCalls) {
  return {
    appendFileSync: (path: string, content: string, encoding: string) => {
      calls.appendFileSync.push([path, content, encoding])
    },
    existsSync: (_path: string) => true,
    mkdirSync: () => {},
    readdirSync: (path: string) => {
      calls.readdirSync.push([path])
      return []
    },
    statSync: (path: string) => {
      calls.statSync.push([path])
      return { mtimeMs: Date.now() }
    },
    unlinkSync: (path: string) => {
      calls.unlinkSync.push([path])
    },
  }
}

// ===== 日志逻辑 =====

/** 确保日志目录存在 */
function ensureLogDir() {
  if (!_fs.existsSync(LOG_DIR)) {
    _fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

/** 获取当天日期字符串 */
function getDateStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const LEVELS = { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' }

/** 核心写入函数 */
function writeLog(level: string, category: string, message: string) {
  try {
    ensureLogDir()
    const dateStr = getDateStr()
    const logFile = resolve(LOG_DIR, `${category}-${dateStr}.log`)
    const timestamp = new Date().toISOString()
    const line = `[${timestamp}] [${level}] ${message}\n`
    _fs.appendFileSync(logFile, line, 'utf-8')
  } catch (err) {
    console.error('写入日志文件失败:', (err as Error).message)
  }
}

export function logAccess(
  method: string,
  url: string,
  statusCode: number,
  durationMs: number,
  ip: string,
  userAgent: string | undefined,
) {
  const msg = `${method} ${url} -> ${statusCode} (${durationMs}ms) | IP: ${ip} | UA: ${(userAgent || '-').substring(0, 120)}`
  writeLog(LEVELS.INFO, 'access', msg)
}

export function logError(message: string, stack: string | null, reqInfo: string | null) {
  const reqStr = reqInfo ? ` | ${reqInfo}` : ''
  writeLog(LEVELS.ERROR, 'error', `${message}${reqStr}`)
  if (stack) {
    try {
      const dateStr = getDateStr()
      const logFile = resolve(LOG_DIR, `error-${dateStr}.log`)
      _fs.appendFileSync(logFile, stack.split('\n').map((l) => `  ${l}`).join('\n') + '\n', 'utf-8')
    } catch (_) { /* ignore */ }
  }
}

export function logInfo(message: string) {
  writeLog(LEVELS.INFO, 'app', message)
  console.log(message)
}

export function logWarn(message: string) {
  writeLog(LEVELS.WARN, 'app', message)
  console.warn(message)
}

export function cleanOldLogs() {
  if (_cleanState.cleanedToday) return
  _cleanState.cleanedToday = true

  try {
    if (!_fs.existsSync(LOG_DIR)) return
    const now = Date.now()
    const maxAge = RETENTION_DAYS * 24 * 60 * 60 * 1000

    const files = _fs.readdirSync(LOG_DIR)
    for (const file of files) {
      if (!file.endsWith('.log')) continue
      const filePath = resolve(LOG_DIR, file)
      const stats = _statSync(filePath)
      if (now - stats.mtimeMs > maxAge) {
        _unlinkSync(filePath)
        console.log(`  清理过期日志: ${file}`)
      }
    }
  } catch (err) {
    console.error('清理日志文件失败:', (err as Error).message)
  }
}