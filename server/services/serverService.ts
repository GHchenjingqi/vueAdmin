/**
 * 服务器监控 Service 层
 *
 * 职责：封装服务器状态监控的业务逻辑
 */

import os from 'os'
import { execSync } from 'child_process'

interface CpuInfo {
  usagePercent: number
  coreCount: number
  model: string
}

interface MemoryInfo {
  total: number
  used: number
  free: number
  usagePercent: number
}

interface DiskInfo {
  caption: string
  total: number
  used: number
  free: number
  usagePercent: number
}

interface LoadInfo {
  load1: number
  load5: number
  load15: number
}

interface UptimeInfo {
  days: number
  hours: number
  minutes: number
  text: string
}

interface OsInfo {
  platform: string
  arch: string
  hostname: string
  nodeVersion: string
}

interface ServerStats {
  cpu: CpuInfo
  memory: MemoryInfo
  disks: DiskInfo[]
  load: LoadInfo
  uptime: UptimeInfo
  os: OsInfo
}

/**
 * 获取 CPU 使用率
 */
function getCPUUsage(): number {
  const cpus = os.cpus()
  let totalIdle = 0
  let totalTick = 0
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times]
    }
    totalIdle += cpu.times.idle
  }
  const idle = totalIdle / cpus.length
  const total = totalTick / cpus.length
  const usage = ((total - idle) / total) * 100
  return Math.round(usage * 100) / 100
}

/**
 * 获取内存信息
 */
function getMemoryInfo(): MemoryInfo {
  const total = os.totalmem()
  const free = os.freemem()
  const used = total - free
  return {
    total: Math.round(total / 1024 / 1024),
    used: Math.round(used / 1024 / 1024),
    free: Math.round(free / 1024 / 1024),
    usagePercent: Math.round((used / total) * 100 * 100) / 100,
  }
}

/**
 * 获取磁盘信息
 */
function getDiskInfo(): DiskInfo[] {
  const disks: DiskInfo[] = []
  let rawOutput: string | null = null

  for (const cmd of [
    'wmic logicaldisk get caption,size,freespace /format:csv',
    'powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Where-Object { $_.Size -gt 0 } | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Csv -NoTypeInformation"',
  ]) {
    try {
      rawOutput = execSync(cmd, { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] })
      if (rawOutput?.trim()) break
    } catch { /* 尝试下一个方法 */ }
  }

  if (!rawOutput?.trim()) return disks

  const lines = rawOutput.trim().split('\n').slice(1)
  for (const line of lines) {
    const parts = line.trim().split(',').map(s => s.replace(/^"|"$/g, '').trim())
    if (parts.length < 3) continue

    let caption: string
    let sizeStr: string
    let freeStr: string
    if (parts.length >= 4) {
      caption = parts[1]
      freeStr = parts[2]
      sizeStr = parts[3]
    } else {
      caption = parts[0]
      sizeStr = parts[1]
      freeStr = parts[2]
    }

    const size = BigInt(sizeStr || '0')
    const freeSpace = BigInt(freeStr || '0')
    if (size <= 0) continue

    const used = Number(size - freeSpace)
    disks.push({
      caption,
      total: Math.round(Number(size) / 1024 / 1024 / 1024 * 100) / 100,
      used: Math.round(used / 1024 / 1024 / 1024 * 100) / 100,
      free: Math.round(Number(freeSpace) / 1024 / 1024 / 1024 * 100) / 100,
      usagePercent: Math.round((used / Number(size)) * 100 * 100) / 100,
    })
  }
  return disks
}

/**
 * 获取服务器负载信息
 */
function getLoadInfo(): LoadInfo {
  try {
    const load = os.loadavg()
    return {
      load1: Math.round(load[0] * 100) / 100,
      load5: Math.round(load[1] * 100) / 100,
      load15: Math.round(load[2] * 100) / 100,
    }
  } catch {
    return { load1: 0, load5: 0, load15: 0 }
  }
}

/**
 * 获取系统运行时间
 */
function getUptime(): UptimeInfo {
  const uptimeSeconds = os.uptime()
  const days = Math.floor(uptimeSeconds / 86400)
  const hours = Math.floor((uptimeSeconds % 86400) / 3600)
  const minutes = Math.floor((uptimeSeconds % 3600) / 60)
  return { days, hours, minutes, text: `${days}天${hours}小时${minutes}分钟` }
}

/**
 * 获取服务器完整状态
 */
export function getServerStats(): ServerStats {
  return {
    cpu: {
      usagePercent: getCPUUsage(),
      coreCount: os.cpus().length,
      model: os.cpus()[0]?.model?.trim() || 'N/A',
    },
    memory: getMemoryInfo(),
    disks: getDiskInfo(),
    load: getLoadInfo(),
    uptime: getUptime(),
    os: {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      nodeVersion: process.version,
    },
  }
}