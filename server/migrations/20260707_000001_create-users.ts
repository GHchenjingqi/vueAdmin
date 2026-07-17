import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('users', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: '用户名',
    },
    nickname: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: '昵称',
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
      comment: '头像 URL',
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: '密码哈希',
    },
    passwordResetRequired: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0,
      comment: '是否需要修改密码',
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
    deptId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '所属部门 ID',
    },
    bio: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: '这个人很懒',
      comment: '个人简介',
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
      comment: '状态: 1=启用, 0=禁用',
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
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('users')
}