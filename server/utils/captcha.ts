import svgCaptcha from 'svg-captcha'
import { randomUUID } from 'crypto'

// 内存存储验证码，key -> { text, createdAt }
const store = new Map()

// 验证码有效期（毫秒）
const CAPTCHA_TTL = 5 * 60 * 1000

// 定时清理过期验证码
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of store) {
    if (now - val.createdAt > CAPTCHA_TTL) {
      store.delete(key)
    }
  }
}, 60_000)

// 生成验证码
export function generate() {
  const captcha = svgCaptcha.createMathExpr({
    mathMin: 1,
    mathMax: 20,
    mathOperator: '+',
    fontSize: 44,
    width: 130,
    height: 44,
    background: '#f0f2f5',
    noise: 2,
    color: true,
  })

  const key = randomUUID()
  store.set(key, { text: captcha.text.toLowerCase(), createdAt: Date.now() })

  return {
    key,
    svg: captcha.data,
  }
}

// 校验验证码（key 只能使用一次，验证后立即销毁）
export function verify(key, text) {
  if (!key || !text) return false
  const entry = store.get(key)
  if (!entry) return false

  // 立即删除，防止重复使用
  store.delete(key)

  // 检查是否过期
  if (Date.now() - entry.createdAt > CAPTCHA_TTL) return false

  return entry.text === String(text).toLowerCase().trim()
}