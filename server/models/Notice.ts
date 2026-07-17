import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class Notice extends Model<InferAttributes<Notice>, InferCreationAttributes<Notice>> {
  declare id: CreationOptional<number>
  declare title: string
  declare content: string
  declare type: 'notice' | 'announcement'
  declare status: 'draft' | 'published'
  declare publisherId: number | null
  declare publisherName: string | null
  declare publishTime: Date | null
  declare isTop: CreationOptional<number>
  declare sort: CreationOptional<number>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Notice.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
    comment: '通知标题',
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '通知内容',
  },
  type: {
    type: DataTypes.ENUM('notice', 'announcement'),
    allowNull: false,
    defaultValue: 'notice',
    comment: '类型: notice=通知, announcement=公告',
  },
  status: {
    type: DataTypes.ENUM('draft', 'published'),
    allowNull: false,
    defaultValue: 'draft',
    comment: '状态: draft=草稿, published=已发布',
  },
  publisherId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: '发布人 ID',
  },
  publisherName: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '发布人名称',
  },
  publishTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '发布时间',
  },
  isTop: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 0,
    comment: '是否置顶: 1=置顶, 0=不置顶',
  },
  sort: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '排序，越小越靠前',
  },
} as any, {
  sequelize,
  tableName: 'notices',
})

export default Notice