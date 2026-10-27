import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class Workflow extends Model<InferAttributes<Workflow>, InferCreationAttributes<Workflow>> {
  declare id: CreationOptional<number>
  declare name: string
  declare description: string | null
  declare status: CreationOptional<number>
  declare draftVersionId: number | null
  declare publishedVersionId: number | null
  declare createdBy: number | null
  /** 租户ID（M1：由租户 scope 钩子按请求上下文注入，DB 默认 1） */
  declare tenantId: number | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Workflow.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '流程名称',
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '流程描述',
    },
    status: {
      type: DataTypes.TINYINT,
      defaultValue: 1,
      comment: '状态: 0=禁用, 1=启用',
    },
    draftVersionId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '当前草稿版本 ID',
    },
    publishedVersionId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '当前线上版本 ID',
    },
    createdBy: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '创建人 ID',
    },
    tenantId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '租户ID',
    },
    // 必要 any：Sequelize 6 的 ModelAttributes 泛型要求 attributes 覆盖隐式
    // timestamps（createdAt/updatedAt），显式补写反而与模型定义重复——
    // 与全仓 models 目录其余模型的 init 收尾保持一致。
  } as any,
  {
    sequelize,
    tableName: 'workflows',
  },
)

export default Workflow
