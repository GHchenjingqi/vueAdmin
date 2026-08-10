import request from '@/utils/request'

export interface Workflow {
  id: number
  name: string
  description: string | null
  status: number
  draftVersionId: number | null
  publishedVersionId: number | null
  createdBy: number | null
  createdAt: string
  updatedAt: string
}

export interface WorkflowNode {
  id?: number
  nodeKey: string
  name: string
  type: 'start' | 'end' | 'condition' | 'approve' | 'notify'
  config?: string
  x?: number
  y?: number
}

export interface WorkflowEdge {
  id?: number
  sourceNodeKey: string
  targetNodeKey: string
  conditionType: 'always' | 'expression'
  conditionExpr?: string
}

export interface ApproverRule {
  id?: number
  nodeKey: string
  ruleType: 'creator' | 'direct_leader' | 'dept_manager' | 'role' | 'dept' | 'user'
  ruleConfig?: string
  sort: number
  name?: string
}

export interface WorkflowInstance {
  id: number
  workflowId: number
  versionId: number
  bindingKey: string | null
  bindingId: number | null
  title: string | null
  status: string
  currentNodeKey: string | null
  startedBy: number | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
}

export interface ApprovalTask {
  id: number
  instanceId: number
  nodeKey: string
  title: string | null
  status: string
  approverId: number | null
  approverName: string | null
  comment: string | null
  assignedAt: string | null
  finishedAt: string | null
  createdAt: string
}

export const workflowApi = {
  list(params?: Record<string, unknown>) {
    return request.get<{ rows: Workflow[]; total: number; page: number; pageSize: number }>('/workflows', { params })
  },
  getById(id: number) {
    return request.get<Workflow>(`/workflows/${id}`)
  },
  create(data: { name: string; description?: string }) {
    return request.post<Workflow>('/workflows', data)
  },
  update(id: number, data: Partial<Workflow>) {
    return request.put<Workflow>(`/workflows/${id}`, data)
  },
  delete(id: number) {
    return request.delete<null>(`/workflows/${id}`)
  },
  toggle(id: number, enabled: boolean) {
    return request.post<Workflow>(`/workflows/${id}/toggle`, { enabled })
  },
  publish(id: number) {
    return request.post<{ workflow: Workflow; publishedVersion: unknown; newDraftVersion: unknown }>(`/workflows/${id}/publish`)
  },
  getDesign(id: number) {
    return request.get<{ nodes: WorkflowNode[]; edges: WorkflowEdge[]; rules: ApproverRule[] }>(`/workflows/${id}/design`)
  },
  upsertNode(workflowId: number, data: WorkflowNode) {
    return request.post<WorkflowNode>(`/workflows/${workflowId}/design/nodes`, data)
  },
  deleteNode(workflowId: number, nodeKey: string) {
    return request.delete<null>(`/workflows/${workflowId}/design/nodes/${nodeKey}`)
  },
  upsertEdge(workflowId: number, data: WorkflowEdge) {
    return request.post<WorkflowEdge>(`/workflows/${workflowId}/design/edges`, data)
  },
  deleteEdge(workflowId: number, sourceKey: string, targetKey: string) {
    return request.delete<null>(`/workflows/${workflowId}/design/edges/${sourceKey}/${targetKey}`)
  },
  upsertApproverRule(workflowId: number, nodeKey: string, data: ApproverRule) {
    return request.post<ApproverRule>(`/workflows/${workflowId}/design/approver-rules/${nodeKey}`, data)
  },
  deleteApproverRule(workflowId: number, ruleId: number) {
    return request.delete<null>(`/workflows/${workflowId}/design/approver-rules/${ruleId}`)
  },
  getInstances(params?: Record<string, unknown>) {
    return request.get<{ rows: WorkflowInstance[]; total: number; page: number; pageSize: number }>('/workflow-instances', { params })
  },
  getInstanceDetail(id: number) {
    return request.get<{ instance: WorkflowInstance; logs: unknown[]; approvals: ApprovalTask[] }>(`/workflow-instances/${id}`)
  },
  retryInstance(id: number) {
    return request.post<null>(`/workflow-instances/${id}/retry`)
  },
  terminateInstance(id: number) {
    return request.post<null>(`/workflow-instances/${id}/terminate`)
  },
  trigger(data: { bindingKey: string; bindingId: number; input?: unknown; title?: string }) {
    return request.post<WorkflowInstance>('/workflow/trigger', data)
  },
  getApprovalTasks(params?: Record<string, unknown>) {
    return request.get<{ rows: ApprovalTask[]; total: number; page: number; pageSize: number }>('/approval-tasks', { params })
  },
  approveTask(id: number, status: 'approved' | 'rejected', comment?: string) {
    return request.patch<null>(`/approval-tasks/${id}`, { status, comment })
  },
  getBindings() {
    return request.get<unknown[]>('/workflow-bindings')
  },
  createBinding(data: { workflowId: number; bindingKey: string; entityName?: string; formKey?: string }) {
    return request.post<unknown>('/workflow-bindings', data)
  },
  deleteBinding(id: number) {
    return request.delete<null>(`/workflow-bindings/${id}`)
  },
}
