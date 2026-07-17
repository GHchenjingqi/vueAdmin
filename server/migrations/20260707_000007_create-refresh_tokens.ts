import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('refresh_tokens', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '用户 ID',
    },
    token: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      comment: 'Refresh Token 值',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: '过期时间',
    },
    revoked: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0,
      comment: '是否已撤销: 1=已撤销, 0=未撤销',
    },
    rememberMe: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0,
      comment: '是否记住登录: 1=7天, 0=1天',
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '撤销时间（多标签宽限期判定）',
    },
    purpose: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'auth',
      comment: '令牌用途: auth=登录认证, password_reset=密码重置',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })
  await queryInterface.addIndex('refresh_tokens', ['userId'], {
    name: 'refresh_tokens_userId',
  })
  await queryInterface.addIndex('refresh_tokens', ['purpose'], {
    name: 'refresh_tokens_purpose',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('refresh_tokens')
}