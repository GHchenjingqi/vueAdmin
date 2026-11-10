/**
 * 真实支付网关凭据字段元数据（唯一权威来源）。
 *
 * 后台「支付凭据配置」与四个网关适配器都从这里取字段定义，避免各文件各自硬编码
 * PREFIX / KEYS 导致漂移：
 * - credentialService.resolveGatewayConfig 用它做 env 兜底 + 掩码；
 * - 各网关用它替换本地 KEYS，统一改为「DB 加密凭据为主、env 兜底」。
 *
 * key 必须与网关代码里访问的 config.<KEY> 完全一致（如 config.CLIENT_ID）。
 * secret=true 的字段在 API 返回与前端均只展示掩码，绝不回显明文。
 */
export interface CredentialFieldDef {
  key: string
  label: string
  secret: boolean
  placeholder?: string
}

export interface ProviderCredentialDef {
  prefix: string
  fields: CredentialFieldDef[]
}

export const PROVIDER_CREDENTIALS: Record<string, ProviderCredentialDef> = {
  paypal: {
    prefix: 'PAYPAL',
    fields: [
      { key: 'CLIENT_ID', label: 'Client ID', secret: false },
      { key: 'CLIENT_SECRET', label: 'Client Secret', secret: true },
      { key: 'ENV', label: '环境(sandbox / live)', secret: false },
      { key: 'WEBHOOK_ID', label: 'Webhook ID', secret: false },
    ],
  },
  wechat: {
    prefix: 'WECHAT',
    fields: [
      { key: 'MCH_ID', label: '商户号 MchId', secret: false },
      { key: 'APP_ID', label: 'AppId', secret: false },
      { key: 'API_V3_KEY', label: 'APIv3 Key', secret: true },
      { key: 'SERIAL_NO', label: '证书序列号', secret: false },
      { key: 'PRIVATE_KEY', label: '商户私钥(PEM)', secret: true, placeholder: '-----BEGIN PRIVATE KEY-----\n...' },
      { key: 'PLATFORM_PUBLIC_KEY', label: '平台公钥(PEM)', secret: true, placeholder: '-----BEGIN PUBLIC KEY-----\n...' },
    ],
  },
  alipay: {
    prefix: 'ALIPAY',
    fields: [
      { key: 'APP_ID', label: 'AppId', secret: false },
      { key: 'PRIVATE_KEY', label: '应用私钥(PEM)', secret: true, placeholder: '-----BEGIN PRIVATE KEY-----\n...' },
      { key: 'PUBLIC_KEY', label: '支付宝公钥(PEM)', secret: true, placeholder: '-----BEGIN PUBLIC KEY-----\n...' },
      { key: 'GATEWAY', label: '网关地址', secret: false },
    ],
  },
  unionpay: {
    prefix: 'UNIONPAY',
    fields: [
      { key: 'MER_ID', label: '商户号 MerId', secret: false },
      { key: 'CERT_ID', label: '证书 ID', secret: false },
      { key: 'PRIVATE_KEY', label: '商户私钥(PEM)', secret: true, placeholder: '-----BEGIN PRIVATE KEY-----\n...' },
      { key: 'PUBLIC_KEY', label: '银联公钥(PEM)', secret: true, placeholder: '-----BEGIN PUBLIC KEY-----\n...' },
      { key: 'GATEWAY', label: '网关地址', secret: false },
      { key: 'FRONT_TRANS_URL', label: '前台交易地址', secret: false },
      { key: 'BACK_TRANS_URL', label: '后台交易地址', secret: false },
    ],
  },
}

/** 支持后台配置凭据的真实通道 id 列表（与 PROVIDERS.real 对齐） */
export const REAL_PROVIDER_IDS = Object.keys(PROVIDER_CREDENTIALS)

export function getProviderCredentialDef(providerId: string): ProviderCredentialDef | undefined {
  return PROVIDER_CREDENTIALS[providerId]
}
