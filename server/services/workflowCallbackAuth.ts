/**
 * 工作流审批回调签名 / 验签（PLAN 14 安全修复）
 *
 * 背景：`POST /api/v1/shop/workflow-callback` 此前完全无鉴权（"内部接口免鉴权"假设），
 * 而 `fireWorkflowCallback` 调用它时也不带任何令牌。该端点与公开 API 共用端口，任何能
 * 访问服务器的客户端（curl 无 Origin 头即可绕过 originValidator 与 CORS）都能匿名伪造审批
 * 回调，绕过审批流擅自把任意 SPU 置为 published/rejected —— CWE-306 + CWE-345。
 *
 * 修复：引擎签发 HMAC-SHA256 签名（含时间戳防重放），端点 fail-closed 校验：
 * 缺签名 / 签名不符 / 时间戳过期 / 密钥未配置 一律 401 拒绝。
 *
 * 密钥：优先取 WORKFLOW_CALLBACK_SECRET；未配置时回退 config.jwt.secret
 * （生产已被启动守卫强制设置，开发期默认密钥仅作用于受信任的本地环境，与 JWT 自身一致）。
 */
import crypto from 'crypto'
import config from '../config/index.js'

const SECRET = config.workflow?.callbackSecret || config.jwt.secret
const TS_TOLERANCE_MS = 5 * 60 * 1000

/** 取待签名字段串：仅含端点实际使用的实例身份与状态，避免 JSON 格式化差异 */
function canonical(instanceId: unknown, status: unknown, ts: number): string {
  return `${String(instanceId)}|${String(status)}|${ts}`
}

/** 引擎侧：基于回调载荷生成签名与时间戳头 */
export function signWorkflowCallback(
  payload: { instanceId?: unknown; status?: unknown },
): { signature: string; ts: number } {
  const ts = Date.now()
  const data = canonical(payload.instanceId, payload.status, ts)
  const signature = crypto.createHmac('sha256', SECRET).update(data).digest('hex')
  return { signature, ts }
}

/** 端点侧：fail-closed 校验。任一条件不满足返回 false（调用方应据此 401）。 */
export function verifyWorkflowCallback(
  instanceId: unknown,
  status: unknown,
  signature: string | undefined,
  ts: string | undefined,
): boolean {
  if (!signature || !ts) return false
  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > TS_TOLERANCE_MS) return false
  const data = canonical(instanceId, status, tsNum)
  const expected = crypto.createHmac('sha256', SECRET).update(data).digest('hex')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
