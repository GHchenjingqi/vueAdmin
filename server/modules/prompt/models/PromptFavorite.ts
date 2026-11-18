import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

class PromptFavorite extends Model<InferAttributes<PromptFavorite>, InferCreationAttributes<PromptFavorite>> {
  declare id: CreationOptional<number>
  declare userId: number
  declare promptId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

PromptFavorite.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '用户 ID' },
    promptId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '提示词 ID' },
    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  } as any,
  {
    sequelize,
    tableName: 'prompt_favorites',
    indexes: [{ unique: true, fields: ['userId', 'promptId'] }],
  },
)

export default PromptFavorite
