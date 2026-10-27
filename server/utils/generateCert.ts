import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import selfsigned from 'selfsigned'
import config from '../config/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface SelfSignedResult {
  private: string
  cert: string
  fingerprint: string
}

const CERT_DIR = path.resolve(__dirname, '../../.cert')
const KEY_PATH = path.join(CERT_DIR, 'server.key')
const CERT_PATH = path.join(CERT_DIR, 'server.crt')

/**
 * 读取或生成自签名证书
 * 开发环境下使用，避免 Chrome HTTPS-First 模式报 ERR_SSL_PROTOCOL_ERROR
 */
export async function getOrCreateCert(): Promise<{ key: string; cert: string }> {
  if (!config.app.useSelfSignedCert) {
    throw new Error('自签名证书已禁用，请配置正式证书')
  }

  // 如果证书已存在，直接读取
  if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
    return {
      key: fs.readFileSync(KEY_PATH, 'utf-8'),
      cert: fs.readFileSync(CERT_PATH, 'utf-8'),
    }
  }

  // 生成新证书（有效期 365 天；selfsigned 5.x 使用 notBeforeDate/notAfterDate，旧版 days 选项已被忽略）
  const notBefore = new Date()
  const notAfter = new Date(notBefore)
  notAfter.setDate(notAfter.getDate() + 365)
  const pems: SelfSignedResult = await selfsigned.generate([{ name: 'commonName', value: '192.168.12.251' }], {
    notBeforeDate: notBefore,
    notAfterDate: notAfter,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '192.168.12.251' },
        ],
      },
    ],
  })

  // 保存到磁盘，下次直接读取
  if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { recursive: true })
  }
  fs.writeFileSync(KEY_PATH, pems.private, 'utf-8')
  fs.writeFileSync(CERT_PATH, pems.cert, 'utf-8')

  return { key: pems.private, cert: pems.cert }
}
