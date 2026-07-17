/**
 * Sequelize 模型类型宽松化
 * 为未声明模型字段的旧代码提供类型支持
 * 后续迁移完整模型类型后可移除
 */

import 'sequelize'

declare module 'sequelize' {
  // 宽松化模型类型，允许通过 [key: string] 访问任意属性
  interface Model<TModelAttributes extends {} = any, TCreationAttributes extends {} = any> {
    [key: string]: any
    id?: number
    createdAt?: Date
    updatedAt?: Date
  }

  // 宽松化 WhereOptions，允许非泛型约束的属性
  interface WhereOptions<T extends {} = any> {
    [key: string]: any
  }
}