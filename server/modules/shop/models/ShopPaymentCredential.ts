import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/**
 * 支付网关凭据加密存储（替代纯环境变量）。
 *
 * 密钥/证书绝不写入全局明文的 settings 表，统一落此处并以 AES-256-GCM 加密：
 * secretBlob = `${ivHex}:${tagHex}:${cipherBase64}`，密钥来自
 * PAYMENT_CREDENTIAL_SECRET 或复用 JWT_SECRET（SHA-256 派生 32 字节）。
 * 每个租户每个通道唯一（uq_tenant_provider）。读取时 DB 主、env 兜底。
 */
class ShopPaymentCredential extends Model<InferAttributes<ShopPaymentCredential>, InferCreationAttributes<ShopPaymentCredential>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare provider: string
  declare secretBlob: string
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopPaymentCredential.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    provider: { type: DataTypes.STRING(32), allowNull: false, comment: '支付通道 providerId(paypal/wechat/alipay/unionpay)' },
    secretBlob: { type: DataTypes.TEXT, allowNull: false, comment: 'AES-256-GCM 加密后的凭据 JSON（iv:tag:ciphertext）' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'shop_payment_credentials', underscored: false },
)

export default ShopPaymentCredential
