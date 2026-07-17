/**
 * 鏂囦欢鏃ュ織鍐欏叆妯″潡
 *
 * fs 渚濊禆閫氳繃妯″潡绾у彉閲忔敞鍏ワ紝娴嬭瘯鏃跺彲閫氳繃 setFsClient() 鏇挎崲銆? * 鐢熶骇鐜浣跨敤鍘熺敓 fs锛岀敓浜т唬鐮佹棤闇€浠讳綍鏀瑰姩銆? */
import * as _fsReal from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 日志目录
const LOG_DIR = resolve(__dirname, '../logs')

// 鏃ュ織淇濈暀澶╂暟
const RETENTION_DAYS = 30

// ===== 鍙敞鍏ョ殑 fs 瀹㈡埛绔紙娴嬭瘯鏃舵浛鎹級 =====
let _fs: typeof _fsReal = _fsReal
let _statSync = _fs.statSync
let _unlinkSync = _fs.unlinkSync

// 防抖状态（对象引用避免 TDZ 问题）
const _cleanState = { cleanedToday: false }
/**
 * 鏇挎崲 fs 瀹炵幇锛堟祴璇曠敤锛? *
 * 浣跨敤鏂瑰紡锛? * ```ts
 * import { setFsClient } from './fileLogger'
 * setFsClient({ appendFileSync: mockFn, ... })
 * ```
 */
export function setFsClient(fsClient: Partial<typeof _fs>) {
  _fs = Object.assign({}, _fsReal, fsClient)
  // 鍚屾鍑芥暟鍗曠嫭缁存姢寮曠敤
  if ('statSync' in fsClient) _statSync = fsClient.statSync!
  if ('unlinkSync' in fsClient) _unlinkSync = fsClient.unlinkSync!
}

/** 鎭㈠鍘熺敓 fs锛堟祴璇?cleanup锛?*/
export function resetFsClient() {
  _fs = _fsReal
  _statSync = _fs.statSync
  _unlinkSync = _fs.unlinkSync
}

/** 閲嶇疆姣忔棩娓呯悊鏍囧織锛堟祴璇曠敤锛?*/
export function resetCleanedToday() {
  _cleanState.cleanedToday = false
}

/** 璇诲彇姣忔棩娓呯悊鐘舵€侊紙娴嬭瘯鐢級 */
export function getCleanedTodayState(): boolean {
  return _cleanState.cleanedToday
}

/** 瀵煎嚭 fs 璋冪敤杩借釜锛堟祴璇曠敤锛?*/
export interface FsCalls {
  appendFileSync: Array<[path: string, content: string, encoding: string]>
  readdirSync: Array<[path: string]>
  statSync: Array<[path: string]>
  unlinkSync: Array<[path: string]>
}

/**
 * 鑾峰彇 fs 璋冪敤杩借釜锛堟祴璇曠敤锛? * 蹇呴』鍦ㄨ皟鐢?setFsClient(trackingFsClient(calls)) 涔嬪悗璋冪敤姝ゅ嚱鏁般€? */
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

// ===== 鏃ュ織閫昏緫 =====

/** 纭繚鏃ュ織鐩綍瀛樺湪 */
function ensureLogDir() {
  if (!_fs.existsSync(LOG_DIR)) {
    _fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

/** 鑾峰彇褰撳ぉ鏃ユ湡瀛楃涓?*/
function getDateStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const LEVELS = { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' }

/** 鏍稿績鍐欏叆鍑芥暟 */
function writeLog(level: string, category: string, message: string) {
  try {
    ensureLogDir()
    const dateStr = getDateStr()
    const logFile = resolve(LOG_DIR, `${category}-${dateStr}.log`)
    const timestamp = new Date().toISOString()
    const line = `[${timestamp}] [${level}] ${message}\n`
    _fs.appendFileSync(logFile, line, 'utf-8')
  } catch (err) {
    console.error('鍐欏叆鏃ュ織鏂囦欢澶辫触:', (err as Error).message)
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
  const msg = `${method} ${url} 鈫?${statusCode} (${durationMs}ms) | IP: ${ip} | UA: ${(userAgent || '-').substring(0, 120)}`
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
        console.log(`  娓呯悊杩囨湡鏃ュ織: ${file}`)
      }
    }
  } catch (err) {
    console.error('娓呯悊鏃ф棩蹇楀け璐?', (err as Error).message)
  }
}
