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
  conditionType: z.enum(['always', 'expression']).default('always'),
  conditionExpr: z.string().max(500).optional(),
})

export const updateEdgeSchema = workflowEdgeSchema.partial()

export const approverRuleSchema = z.object({
  ruleType: z.enum(['creator', 'direct_leader', 'dept_manager', 'role', 'dept', 'user']),
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
})

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>
export type WorkflowNodeInput = z.infer<typeof workflowNodeSchema>
export type WorkflowEdgeInput = z.infer<typeof workflowEdgeSchema>
export type ApproverRuleInput = z.infer<typeof approverRuleSchema>
export type WorkflowBindingInput = z.infer<typeof workflowBindingSchema>
export type TriggerWorkflowInput = z.infer<typeof triggerWorkflowSchema>
export type ApproveTaskInput = z.infer<typeof approveTaskSchema>