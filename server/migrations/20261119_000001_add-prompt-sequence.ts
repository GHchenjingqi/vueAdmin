import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** 提示词套组：为 prompts 增加 sequence 类型元数据，新增步骤表，图片归属到步骤 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('prompts', 'type', {
    type: DataTypes.ENUM('single', 'sequence'),
    allowNull: false,
    defaultValue: 'single',
    comment: '内容形态: single=单条, sequence=有序步骤套组',
  })
  await queryInterface.addColumn('prompts', 'characterAnchor', {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '角色锚定提示词：套组每步生成时共同携带，保证人物/场景一致',
  })

  await queryInterface.createTable('prompt_steps', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    promptId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '所属提示词 ID' },
    stepOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '步骤序号，从 1 开始' },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '动作名，如「起势」' },
    actionPrompt: { type: DataTypes.TEXT, allowNull: false, comment: '该步动作提示词' },
    camera: { type: DataTypes.STRING(200), allowNull: true, comment: '镜头/机位建议' },
    seconds: { type: DataTypes.INTEGER, allowNull: true, comment: '建议时长（秒）' },
    transition: { type: DataTypes.TEXT, allowNull: true, comment: '与下一步的衔接过渡说明' },
    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  })
  await queryInterface.addIndex('prompt_steps', ['promptId', 'stepOrder'], { name: 'idx_ps_prompt_order' })

  await queryInterface.addColumn('prompt_images', 'stepId', {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: '所属步骤 ID；单条提示词为 NULL',
  })
  await queryInterface.addIndex('prompt_images', ['stepId'], { name: 'idx_pi_step' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('prompt_images', 'idx_pi_step')
  await queryInterface.removeColumn('prompt_images', 'stepId')
  await queryInterface.dropTable('prompt_steps')
  await queryInterface.removeColumn('prompts', 'characterAnchor')
  await queryInterface.removeColumn('prompts', 'type')
}
