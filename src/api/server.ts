/**
 * 服务监控 API
 */
import request from '@/utils/request'

export interface ServerStats {
  cpu: {
    usagePercent: number
    coreCount: number
    model: string
  }
  memory: {
    total: number
    used: number
    free: number
    usagePercent: number
  }
  disks: Array<{
    caption: string
    total: number
    used: number
    free: number
    usagePercent: number
  }>
  load: {
    load1: number
    load5: number
    load15: number
  }
  uptime: {
    days: number
    hours: number
    minutes: number
    text: string
  }
  os: {
    platform: string
    arch: string
    hostname: string
    nodeVersion: string
  }
}

export const serverApi = {
  /** 获取服务器状态 */
  getStats() {
    return request.get<ServerStats>('/server/stats')
  },
}
