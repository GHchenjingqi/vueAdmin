import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'
import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>
  declare username: string
  declare nickname: string | null
  declare email: string
  declare phone: string | null
  declare avatar: string | null
  declare password: string
  declare status: CreationOptional<number>
  declare deptId: number | null
  declare bio: string | null
  declare passwordResetRequired: CreationOptional<number>
  declare loginAttempts: CreationOptional<number>
  declare lockedUntil: Date | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>

  /**
   * 验证密码（实例方法）
   */
  async verifyPassword(plainPassword: string): Promise<boolean> {
    if (!this.password) return false
    if (!this.password.startsWith('$2a$') && !this.password.startsWith('$2b$')) {
      console.warn(`用户 ${this.username} 的密码哈希格式异常，拒绝验证`)
      return false
    }
    return bcrypt.compare(plainPassword, this.password)
  }
}

User.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: '用户名（登录用）',
  },
  nickname: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '昵称（显示用）',
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: '邮箱',
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: '手机号',
  },
  avatar: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: '头像地址',
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: '123456',
    comment: '密码（bcrypt 哈希）',
  },
  status: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1,
    comment: '状态: 1=启用, 0=禁用',
  },
  deptId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: '部门 ID',
  },
  bio: {
    type: DataTypes.STRING(500),
    allowNull: true,
    defaultValue: '这个人很懒',
    comment: '个人介绍',
  },
  passwordResetRequired: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 0,
    comment: '首次登录/重置后是否需要修改密码: 1=需要, 0=不需要',
  },
  loginAttempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '连续登录失败次数',
  },
  lockedUntil: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '账号锁定截止时间',
  },
} as any, {
  sequelize,
  tableName: 'users',
  indexes: [
    { fields: ['deptId'] },
  ],
  hooks: {
    beforeCreate: async (user: User) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, SALT_ROUNDS)
      }
    },
    beforeUpdate: async (user: User) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, SALT_ROUNDS)
      }
    },
  },
})

export default User