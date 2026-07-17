import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

/**
 * AI 提供商模型
 * 存储可自定义的 AI API 配置（如 DeepSeek、OpenAI、通义千问等）
 */
class AiProvider extends Model<InferAttributes<AiProvider>, InferCreationAttributes<AiProvider>> {
  declare id: CreationOptional<number>
  declare name: string
  declare apiBaseUrl: string
  declare apiKey: string
  declare models: string
  declare defaultModel: string
  declare enabled: CreationOptional<number>
  declare sort: CreationOptional<number>
  declare description: string | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

AiProvider.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: '提供商名称，如 DeepSeek、OpenAI',
  },
  apiBaseUrl: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'API 基础地址，如 https://api.deepseek.com',
  },
  apiKey: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'API Key（加密存储）',
  },
  models: {
    type: DataTypes.STRING(500),
    allowNull: false,
    defaultValue: 'deepseek-chat',
    comment: '可用模型列表，逗号分隔',
  },
  defaultModel: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'deepseek-chat',
    comment: '默认模型名称',
  },
  enabled: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1,
    comment: '是否启用: 1=启用, 0=禁用',
  },
  sort: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '排序号，越小越靠前',
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: '备注说明',
  },
} as any, {
  sequelize,
  tableName: 'ai_providers',
})

export default AiProvider