import type { QueryInterface } from 'sequelize'
import { logInfo } from '../utils/fileLogger.js'

/** 扩展工作流审批人规则类型与表单字段类型枚举 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    "ALTER TABLE workflow_approver_rules MODIFY COLUMN ruleType ENUM('creator','direct_leader','dept_manager','role','dept','user','field') NOT NULL COMMENT '审批人规则类型'",
  )
  await queryInterface.sequelize.query(
    "ALTER TABLE workflow_form_fields MODIFY COLUMN type ENUM('text','textarea','number','select','date','file') NOT NULL DEFAULT 'text' COMMENT '字段类型'",
  )
  logInfo('工作流枚举已扩展（field 审批规则 / file 表单字段）')
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    "ALTER TABLE workflow_approver_rules MODIFY COLUMN ruleType ENUM('creator','direct_leader','dept_manager','role','dept','user') NOT NULL COMMENT '审批人规则类型'",
  )
  await queryInterface.sequelize.query(
    "ALTER TABLE workflow_form_fields MODIFY COLUMN type ENUM('text','textarea','number','select','date') NOT NULL DEFAULT 'text' COMMENT '字段类型'",
  )
}
