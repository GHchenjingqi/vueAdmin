import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

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
  // 如果证书已存在，直接读取
  if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
    return {
      key: fs.readFileSync(KEY_PATH, 'utf-8'),
      cert: fs.readFileSync(CERT_PATH, 'utf-8'),
    }
  }

  // 生成新证书
  const selfsignedModule = await import('selfsigned')
  const selfsigned = selfsignedModule.default as { generate: (attrs: unknown[], options: Record<string, unknown>) => Promise<SelfSignedResult> }
  const pems: SelfSignedResult = await selfsigned.generate(
    [
      { name: 'commonName', value: '192.168.12.251' },
    ],
    {
      days: 365,
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
    }
  )

  // 保存到磁盘，下次直接读取
  if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { recursive: true })
  }
  fs.writeFileSync(KEY_PATH, pems.private, 'utf-8')
  fs.writeFileSync(CERT_PATH, pems.cert, 'utf-8')

  return { key: pems.private, cert: pems.cert }
}