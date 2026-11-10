import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 支付网关凭据加密存储表（替代纯环境变量）。
 * 每个租户每个通道唯一（uq_tenant_provider）；secretBlob 为 AES-256-GCM 密文。
 * 幂等：up/down 均先探测存在性；不动存量数据。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (!tables.includes('shop_payment_credentials')) {
    await queryInterface.createTable('shop_payment_credentials', {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
      provider: { type: DataTypes.STRING(32), allowNull: false, comment: '支付通道 providerId(paypal/wechat/alipay/unionpay)' },
      secretBlob: { type: DataTypes.TEXT, allowNull: false, comment: 'AES-256-GCM 加密后的凭据 JSON（iv:tag:ciphertext）' },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('shop_payment_credentials', ['tenantId', 'provider'], {
      unique: true,
      name: 'uq_tenant_provider',
    })
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (tables.includes('shop_payment_credentials')) {
    await queryInterface.dropTable('shop_payment_credentials')
  }
}
