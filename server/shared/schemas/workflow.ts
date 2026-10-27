import { z } from 'zod'

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
})

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.number().int().min(0).max(1).optional(),
})

export const workflowNodeSchema = z.object({
  nodeKey: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  type: z.enum(['start', 'end', 'condition', 'approve', 'notify']),
  config: z.string().optional(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
})

export const updateNodeSchema = workflowNodeSchema.partial()

export const workflowEdgeSchema = z.object({
  sourceNodeKey: z.string().min(1).max(50),
  targetNodeKey: z.string().min(1).max(50),
  sourceHandle: z.string().max(20).optional(),
  conditionType: z.enum(['always', 'expression']).default('always'),
  conditionExpr: z.string().max(500).optional(),
})

export const updateEdgeSchema = workflowEdgeSchema.partial()

export const approverRuleSchema = z.object({
  ruleType: z.enum(['creator', 'direct_leader', 'dept_manager', 'role', 'dept', 'user', 'field']),
  ruleConfig: z.string().optional(),
  sort: z.number().int().min(0).default(0),
  name: z.string().max(100).optional(),
})

export const updateApproverRuleSchema = approverRuleSchema.partial()

export const workflowBindingSchema = z.object({
  workflowId: z.number().int().positive(),
  bindingKey: z.string().min(1).max(100),
  entityName: z.string().max(100).optional(),
  formKey: z.string().max(100).optional(),
  callbackUrl: z.string().max(500).optional(),
})

/** 委托审批：当前用户把自己的待办临时委托给他人 */
export const delegateWorkflowSchema = z.object({
  toUserId: z.number().int().positive(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  remark: z.string().max(200).optional(),
})

export const workflowFormFieldSchema = z.object({
  fieldKey: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  type: z.enum(['text', 'textarea', 'number', 'select', 'date', 'file']),
  required: z.boolean().default(false),
  options: z.string().max(2000).optional(),
  placeholder: z.string().max(200).optional(),
  sort: z.number().int().min(0).default(0),
})

export const workflowFormFieldsPayloadSchema = z.object({
  fields: z.array(workflowFormFieldSchema),
})

export const triggerWorkflowSchema = z.object({
  bindingKey: z.string().min(1).max(100),
  bindingId: z.number().int().positive(),
  input: z.any().optional(),
  title: z.string().max(200).optional(),
})

export const approveTaskSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  comment: z.string().max(500).optional(),
}).refine((d) => d.status !== 'rejected' || (d.comment && d.comment.trim().length > 0), {
  message: '驳回时必须填写审批意见',
  path: ['comment'],
})

// 设计器整图批量保存载荷（事务内校验后写入）
export const workflowDesignPayloadSchema = z.object({
  nodes: z.array(
    z.object({
      nodeKey: z.string().min(1).max(50),
      name: z.string().min(1).max(100),
      type: z.enum(['start', 'end', 'condition', 'approve', 'notify']),
      config: z.string().max(2000).optional(),
      x: z.number().int().optional(),
      y: z.number().int().optional(),
    }),
  ),
  edges: z.array(
    z.object({
      sourceNodeKey: z.string().min(1).max(50),
      targetNodeKey: z.string().min(1).max(50),
      sourceHandle: z.string().max(20).optional(),
      conditionType: z.enum(['always', 'expression']).default('always'),
      conditionExpr: z.string().max(500).optional(),
    }),
  ),
  rules: z.array(
    z.object({
      nodeKey: z.string().min(1).max(50),
      ruleType: z.enum(['creator', 'direct_leader', 'dept_manager', 'role', 'dept', 'user', 'field']),
      ruleConfig: z.string().max(2000).optional(),
      sort: z.number().int().min(0).default(0),
      name: z.string().max(100).optional(),
    }),
  ),
})
export type WorkflowDesignPayload = z.infer<typeof workflowDesignPayloadSchema>

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>
export type WorkflowNodeInput = z.infer<typeof workflowNodeSchema>
export type WorkflowEdgeInput = z.infer<typeof workflowEdgeSchema>
export type ApproverRuleInput = z.infer<typeof approverRuleSchema>
export type WorkflowBindingInput = z.infer<typeof workflowBindingSchema>
export type TriggerWorkflowInput = z.infer<typeof triggerWorkflowSchema>
export type ApproveTaskInput = z.infer<typeof approveTaskSchema>

// ==================== 常用驳回理由（可配置） ====================

export const createRejectReasonSchema = z.object({
  content: z.string().trim().min(1).max(200),
  sort: z.number().int().min(0).max(9999).optional(),
  enabled: z.number().int().min(0).max(1).optional(),
})

export const updateRejectReasonSchema = z.object({
  content: z.string().trim().min(1).max(200).optional(),
  sort: z.number().int().min(0).max(9999).optional(),
  enabled: z.number().int().min(0).max(1).optional(),
})

export type CreateRejectReasonInput = z.infer<typeof createRejectReasonSchema>
export type UpdateRejectReasonInput = z.infer<typeof updateRejectReasonSchema>
