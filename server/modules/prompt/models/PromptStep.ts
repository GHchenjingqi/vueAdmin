import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 套组中的有序步骤：一步对应一个肢体动作 */
class PromptStep extends Model<InferAttributes<PromptStep>, InferCreationAttributes<PromptStep>> {
  declare id: CreationOptional<number>
  declare promptId: number
  declare stepOrder: CreationOptional<number>
  declare name: string
  declare actionPrompt: string
  declare camera: CreationOptional<string | null>
  declare seconds: CreationOptional<number | null>
  declare transition: CreationOptional<string | null>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

PromptStep.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    promptId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '所属提示词 ID' },
    stepOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '步骤序号' },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '动作名' },
    actionPrompt: { type: DataTypes.TEXT, allowNull: false, comment: '该步动作提示词' },
    camera: { type: DataTypes.STRING(200), allowNull: true },
    seconds: { type: DataTypes.INTEGER, allowNull: true },
    transition: { type: DataTypes.TEXT, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  } as any,
  {
    sequelize,
    tableName: 'prompt_steps',
  },
)

export default PromptStep
