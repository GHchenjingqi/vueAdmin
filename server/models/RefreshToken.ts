import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'
import crypto from 'crypto'

class RefreshToken extends Model<InferAttributes<RefreshToken>, InferCreationAttributes<RefreshToken>> {
  declare id: CreationOptional<number>
  declare userId: number
  declare token: string
  declare expiresAt: Date
  declare revoked: CreationOptional<number>
  declare rememberMe: CreationOptional<number>
  declare revokedAt: Date | null
  declare purpose: CreationOptional<string>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>

  static generateToken(): string {
    return crypto.randomBytes(32).toString('hex')
  }
}

RefreshToken.init({
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
    comment: '撤销时间（用于多标签页30秒宽限期判定）',
  },
  purpose: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'auth',
    comment: '令牌用途: auth=登录认证, password_reset=密码重置',
  },
} as any, {
  sequelize,
  tableName: 'refresh_tokens',
  indexes: [
    { fields: ['userId'] },
    { fields: ['purpose'] },
  ],
})

export default RefreshToken