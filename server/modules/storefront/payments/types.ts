/**
 * 支付网关适配器统一契约。
 *
 * 目标：把「各网关不同的下单、验签、事件格式、退款」收敛到适配器内，
 * paymentService 只处理统一事件，从而复用现有的 (provider, providerRef) 幂等、
 * 订单 paymentStatus CAS 认领、库存预占 commit、审计与邮件入队等底座。
 *
 * 金额一律整数「分」，币种恒取订单快照（不做任何换算）。
 */
export interface GatewayOrderContext {
  orderNo: string
  amountCents: number
  currency: string
  /** 本地幂等键；内部 (provider, providerRef) 去重使用 */
  providerRef: string
  /** 网关商户订单号（纯字母数字，作为 out_trade_no / invoice_id / orderId） */
  gatewayOrderNo: string
  /** 支付结果异步通知地址（必须为公网 HTTPS） */
  notifyUrl: string
  /** 用户支付完成后的站内返回地址 */
  returnUrl: string
  /** 展示用描述 */
  subject: string
  tenantId: number
}

/** 收银台动作：前端据此拉起跳转 / 二维码 / 表单 / SDK */
export type GatewayAction = 'redirect' | 'qr' | 'form' | 'sdk' | 'mock'

export interface GatewaySession {
  action: GatewayAction
  redirectUrl?: string
  qrCode?: string
  /** form 自动提交：method + 目标 + 键值（支付宝网页支付 / 银联前台跳转） */
  form?: { url: string; method: 'GET' | 'POST'; fields: Record<string, string> }
  /** 网关侧单号（PayPal order id / 微信 prepay_id / 支付宝 trade_no / 银联 queryId） */
  gatewayRef?: string
  /** SDK 所需参数（PayPal clientId / 微信 prepay 包） */
  clientParams?: Record<string, string>
}

/** 验签解析后的统一事件（字段与现有 mock webhook 契约一致） */
export interface GatewayEvent {
  type: 'payment.succeeded' | 'payment.failed'
  /** 内部幂等键或网关商户订单号，二者至少给一个 */
  providerRef?: string
  gatewayOrderNo?: string
  orderNo?: string
  amountCents?: number
  currency?: string
  gatewayRef?: string
  raw: Record<string, unknown>
}

export interface GatewayNotifyContext {
  rawBody: Buffer
  headers: Record<string, string | string[] | undefined>
  /** 供验签时读取配置；不落库 */
  config: Record<string, string>
}

export interface GatewayRefundContext {
  refundNo: string
  orderNo: string
  amountCents: number
  currency: string
  /** 原支付网关单号 */
  gatewayRef?: string
  /** 原支付金额（分），部分退款时用于网关要求的原单金额 */
  originalAmountCents?: number
}

export interface PaymentGateway {
  id: string
  /** 读取环境变量配置；缺关键项抛 503，禁止静默降级为 mock */
  assertConfigured(): void
  createPayment(ctx: GatewayOrderContext): Promise<GatewaySession>
  /** 验签 + 解析；验签失败抛 AppError(401)，解析失败抛 AppError(400) */
  verifyAndParse(ctx: GatewayNotifyContext): Promise<GatewayEvent>
  /** 网关要求「用户返回后服务端主动确认」时实现（PayPal capture） */
  capture?(ctx: { gatewayRef: string; config: Record<string, string> }): Promise<GatewayEvent>
  /** 主动查单（通知丢失时补单） */
  query?(ctx: { orderNo: string; providerRef: string; gatewayRef?: string; config: Record<string, string> }): Promise<GatewayEvent | null>
  refund?(ctx: GatewayRefundContext & { config: Record<string, string> }): Promise<{ providerRef?: string }>
  /** 通知成功应答体（支付宝要求纯文本 success，微信要求 JSON） */
  successResponse?(): { contentType: string; body: string }
}
