import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import Setting from '../models/Setting.js'

/**
 * 从 settings 表读取 SMTP 配置，动态创建 transporter
 * 环境变量优先级最高（向下兼容），settings 表次之
 */
export async function getTransporter(): Promise<Transporter | null> {
  // 环境变量优先
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  }

  try {
    const enabled = await Setting.findOne({ where: { optionKey: 'smtp_enabled' } })
    if (!enabled || enabled.optionValue !== '1') return null

    const host = await Setting.findOne({ where: { optionKey: 'smtp_host' } })
    const port = await Setting.findOne({ where: { optionKey: 'smtp_port' } })
    const secure = await Setting.findOne({ where: { optionKey: 'smtp_secure' } })
    const user = await Setting.findOne({ where: { optionKey: 'smtp_user' } })
    const pass = await Setting.findOne({ where: { optionKey: 'smtp_pass' } })

    if (!host?.optionValue || !user?.optionValue || !pass?.optionValue) return null

    return nodemailer.createTransport({
      host: host.optionValue,
      port: parseInt(port?.optionValue || '465', 10),
      secure: secure?.optionValue === '1',
      auth: {
        user: user.optionValue,
        pass: pass.optionValue,
      },
    })
  } catch {
    return null
  }
}

export async function getSenderName(): Promise<string> {
  try {
    const setting = await Setting.findOne({ where: { optionKey: 'smtp_sender_name' } })
    return setting?.optionValue || 'Vue Admin'
  } catch {
    return 'Vue Admin'
  }
}