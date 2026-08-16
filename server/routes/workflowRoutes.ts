import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { paginationSchema, idParamSchema } from '../shared/schemas/common.js'
import {
  createWorkflowSchema, updateWorkflowSchema,
  workflowNodeSchema, updateNodeSchema,
  workflowEdgeSchema, updateEdgeSchema,
  approverRuleSchema, updateApproverRuleSchema,
  workflowBindingSchema, triggerWorkflowSchema,
  approveTaskSchema,
} from '../shared/schemas/workflow.js'
import * as workflowController from '../controllers/workflowController.js'
import * as workflowInstanceController from '../controllers/workflowInstanceController.js'
import * as approvalController from '../controllers/approvalController.js'

const router = Router()

// ==================== 工作流定义 ====================

router.get('/workflows', authMiddleware, workflowController.list)
router.get('/workflows/:id', authMiddleware, validate(idParamSchema, 'params'), workflowController.getById)
router.post('/workflows', authMiddleware, validate(createWorkflowSchema), workflowController.create)
router.put('/workflows/:id', authMiddleware, validate(idParamSchema, 'params'), validate(updateWorkflowSchema), workflowController.update)
router.delete('/workflows/:id', authMiddleware, validate(idParamSchema, 'params'), workflowController.remove)
router.post('/workflows/:id/toggle', authMiddleware, validate(idParamSchema, 'params'), workflowController.toggle)
router.post('/workflows/:id/publish', authMiddleware, validate(idParamSchema, 'params'), workflowController.publish)

// ==================== 工作流设计（节点/边/审批人规则） ====================

router.get('/workflows/:id/design', authMiddleware, validate(idParamSchema, 'params'), workflowController.getDesign)

router.post('/workflows/:id/design/nodes', authMiddleware, validate(idParamSchema, 'params'), validate(workflowNodeSchema), workflowController.upsertNode)
router.put('/workflows/:id/design/nodes/:nodeKey', authMiddleware, workflowController.upsertNode)
router.delete('/workflows/:id/design/nodes/:nodeKey', authMiddleware, workflowController.deleteNode)

router.post('/workflows/:id/design/edges', authMiddleware, validate(idParamSchema, 'params'), validate(workflowEdgeSchema), workflowController.upsertEdge)
router.delete('/workflows/:id/design/edges/:sourceKey/:targetKey', authMiddleware, workflowController.deleteEdge)

router.post('/workflows/:id/design/approver-rules/:nodeKey', authMiddleware, validate(idParamSchema, 'params'), validate(approverRuleSchema), workflowController.upsertApproverRule)
router.put('/workflows/:id/design/approver-rules/:nodeKey', authMiddleware, workflowController.upsertApproverRule)
router.delete('/workflows/:id/design/approver-rules/:ruleId', authMiddleware, workflowController.deleteApproverRule)

// ==================== 流程绑定 ====================

router.get('/workflow-bindings', authMiddleware, workflowController.listBindings)
router.post('/workflow-bindings', authMiddleware, validate(workflowBindingSchema), workflowController.createBinding)
router.delete('/workflow-bindings/:id', authMiddleware, workflowController.deleteBinding)

// ==================== 触发与实例 ====================

router.post('/workflow/trigger', authMiddleware, validate(triggerWorkflowSchema), workflowInstanceController.trigger)
router.get('/workflow-instances', authMiddleware, workflowInstanceController.listInstances)
router.get('/workflow-instances/:id', authMiddleware, validate(idParamSchema, 'params'), workflowInstanceController.getInstanceDetail)
router.post('/workflow-instances/:id/retry', authMiddleware, validate(idParamSchema, 'params'), workflowInstanceController.retryInstance)
router.post('/workflow-instances/:id/terminate', authMiddleware, validate(idParamSchema, 'params'), workflowInstanceController.terminateInstance)

// ==================== 审批 ====================

router.get('/approval-tasks', authMiddleware, approvalController.listMyTasks)
router.patch('/approval-tasks/:id', authMiddleware, validate(idParamSchema, 'params'), validate(approveTaskSchema), approvalController.approve)

export default router