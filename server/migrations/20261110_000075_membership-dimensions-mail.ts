import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 跨境会员三维度分级 + 营销邮件系统：
 * - membership_tiers 加列：loginFrequency（登录频率门槛：累计登录次数）、orderCountThreshold（消费次数门槛）、
 *   matchStrategy（any=任一维度达标即达标 / all=全部达标）；growthThreshold 语义明确为「累计消费金额门槛（元）」。
 * - customers 加列：orderCount（累计消费次数）、loginCount（累计登录次数）、lastLoginAt（最近登录）。
 * - mail_campaigns：营销邮件任务（受众 all_customers / tier / all_users / emails；状态 pending/sending/sent/partial/failed）。
 * - mail_campaign_recipients：收件人明细（customer/user 两类；status pending/sent/failed；error 可溯）。
 * 幂等：up/down 均先探测存在性。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]

  if (tables.includes('membership_tiers')) {
    const cols = (await queryInterface.describeTable('membership_tiers')) as Record<string, unknown>
    if (!cols.loginFrequency) {
      await queryInterface.addColumn('membership_tiers', 'loginFrequency', {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 0,
        comment: '登录频率门槛（累计登录次数 >=）',
      })
    }
    if (!cols.orderCountThreshold) {
      await queryInterface.addColumn('membership_tiers', 'orderCountThreshold', {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 0,
        comment: '消费次数门槛（累计消费次数 >=）',
      })
    }
    if (!cols.matchStrategy) {
      await queryInterface.addColumn('membership_tiers', 'matchStrategy', {
        type: DataTypes.STRING(8), allowNull: false, defaultValue: 'any',
        comment: '达标策略：any=任一维度达标 / all=全部达标',
      })
    }
    // 既有种子门槛语义升级：growthThreshold 原为成长值（=累计消费元数），保持数值不变，注释明确为消费金额门槛
    await queryInterface.sequelize.query(
      "ALTER TABLE membership_tiers MODIFY COLUMN growthThreshold INT NOT NULL DEFAULT 0 COMMENT '消费金额门槛（累计消费元数 >=）'",
    )
  }

  if (tables.includes('customers')) {
    const cols = (await queryInterface.describeTable('customers')) as Record<string, unknown>
    if (!cols.orderCount) {
      await queryInterface.addColumn('customers', 'orderCount', {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '累计消费次数（captured 订单）',
      })
    }
    if (!cols.loginCount) {
      await queryInterface.addColumn('customers', 'loginCount', {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '累计登录次数',
      })
    }
    if (!cols.lastLoginAt) {
      await queryInterface.addColumn('customers', 'lastLoginAt', {
        type: DataTypes.DATE, allowNull: true, comment: '最近登录时间',
      })
    }
  }

  if (!tables.includes('mail_campaigns')) {
    await queryInterface.createTable('mail_campaigns', {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
      subject: { type: DataTypes.STRING(200), allowNull: false, comment: '邮件主题' },
      body: { type: DataTypes.TEXT, allowNull: false, comment: '邮件正文（纯文本，支持 {{nickname}} {{points}} 变量）' },
      audienceType: { type: DataTypes.STRING(32), allowNull: false, comment: 'all_customers/tier/all_users/emails' },
      audienceParam: { type: DataTypes.STRING(255), allowNull: true, comment: '参数：tier 等级ID / emails 逗号分隔邮箱' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'pending', comment: 'pending/sending/sent/partial/failed' },
      totalCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '收件人总数' },
      sentCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '成功数' },
      failedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '失败数' },
      operatorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '创建管理员' },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('mail_campaigns', ['tenantId', 'createdAt'], { name: 'idx_campaigns_tenant_time' })
  }

  if (!tables.includes('mail_campaign_recipients')) {
    await queryInterface.createTable('mail_campaign_recipients', {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
      campaignId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '任务ID' },
      recipientType: { type: DataTypes.STRING(16), allowNull: false, comment: 'customer/user/bare' },
      recipientId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '顾客/用户ID（bare 为空）' },
      email: { type: DataTypes.STRING(255), allowNull: false, comment: '收件邮箱' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'pending', comment: 'pending/sent/failed' },
      error: { type: DataTypes.STRING(500), allowNull: true, comment: '失败原因' },
      sentAt: { type: DataTypes.DATE, allowNull: true, comment: '发送时间' },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('mail_campaign_recipients', ['campaignId', 'status'], { name: 'idx_recipients_campaign_status' })
    await queryInterface.addIndex('mail_campaign_recipients', ['tenantId', 'campaignId', 'email'], { unique: true, name: 'uq_recipients_campaign_email' })
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (tables.includes('mail_campaign_recipients')) await queryInterface.dropTable('mail_campaign_recipients')
  if (tables.includes('mail_campaigns')) await queryInterface.dropTable('mail_campaigns')
  if (tables.includes('customers')) {
    const cols = (await queryInterface.describeTable('customers')) as Record<string, unknown>
    if (cols.lastLoginAt) await queryInterface.removeColumn('customers', 'lastLoginAt')
    if (cols.loginCount) await queryInterface.removeColumn('customers', 'loginCount')
    if (cols.orderCount) await queryInterface.removeColumn('customers', 'orderCount')
  }
  if (tables.includes('membership_tiers')) {
    const cols = (await queryInterface.describeTable('membership_tiers')) as Record<string, unknown>
    if (cols.matchStrategy) await queryInterface.removeColumn('membership_tiers', 'matchStrategy')
    if (cols.orderCountThreshold) await queryInterface.removeColumn('membership_tiers', 'orderCountThreshold')
    if (cols.loginFrequency) await queryInterface.removeColumn('membership_tiers', 'loginFrequency')
  }
}
