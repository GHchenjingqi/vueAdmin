import { Sequelize, type Dialect } from 'sequelize'
import config from './index.js'

const { database } = config

const sequelize = new Sequelize(database.name, database.user, database.password, {
  host: database.host,
  port: database.port,
  dialect: database.dialect as Dialect,
  logging: false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    timestamps: true,        // 自动添加 createdAt / updatedAt
    underscored: false,
    freezeTableName: true,   // 禁止表名复数
  },
})

export default sequelize