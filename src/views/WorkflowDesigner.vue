<template>
  <div class="workflow-designer">
    <div class="designer-header">
      <div class="header-left">
        <el-button text :icon="ArrowLeft" @click="goBack">返回</el-button>
        <span class="header-title">{{ workflow?.name || '流程设计器' }}</span>
        <el-tag v-if="workflow?.publishedVersionId" type="success" size="small">线上 V{{ publishedVersionNo }}</el-tag>
        <el-tag v-if="workflow?.draftVersionId" type="warning" size="small">草稿 V{{ draftVersionNo }}</el-tag>
      </div>
      <div class="header-right">
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
        <el-button type="success" :loading="publishing" @click="handlePublish">发布</el-button>
      </div>
    </div>

    <div class="designer-body">
      <div class="node-palette">
        <div class="palette-title">节点类型</div>
        <div v-for="nt in nodeTypes" :key="nt.type" class="palette-item" draggable="true" @dragstart="onDragStart($event, nt.type)">
          <el-icon><component :is="nt.icon" /></el-icon>
          <span>{{ nt.label }}</span>
        </div>
      </div>

      <div class="canvas-wrapper" @drop="onDrop" @dragover.prevent>
        <VueFlow
          :nodes="flowNodes"
          :edges="flowEdges"
          fit-view-on-init
          @nodes-change="onNodesChange"
          @edges-change="onEdgesChange"
          @node-click="onNodeClick"
          @pane-click="onPaneClick"
          @connect="onConnect"
        >
          <Background />
          <Controls />
          <MiniMap />
        </VueFlow>
      </div>

      <div v-if="selectedNode" class="node-config-panel">
        <div class="panel-title">节点配置</div>
        <el-form label-width="80px" size="small">
          <el-form-item label="名称">
            <el-input :model-value="selectedNode.data?.label" @update:model-value="updateNodeName($event)" />
          </el-form-item>
          <el-form-item label="类型">
            <el-tag>{{ nodeTypeLabel(selectedNode.type) }}</el-tag>
          </el-form-item>

          <template v-if="selectedNode.type === 'notify'">
            <el-form-item label="标题">
              <el-input v-model="notifyConfig.title" placeholder="通知标题" />
            </el-form-item>
            <el-form-item label="内容">
              <el-input v-model="notifyConfig.content" type="textarea" :rows="3" placeholder="通知内容" />
            </el-form-item>
          </template>

          <template v-if="selectedNode.type === 'approve'">
            <div class="approver-rules-section">
              <div class="section-title">审批人规则</div>
              <div v-for="(rule, idx) in approverRules" :key="idx" class="rule-item">
                <el-select :model-value="rule.ruleType" size="small" style="width: 140px" @update:model-value="(v) => updateRuleType(idx, v)">
                  <el-option label="发起人本人" value="creator" />
                  <el-option label="直属上级" value="direct_leader" />
                  <el-option label="部门主管" value="dept_manager" />
                  <el-option label="指定角色" value="role" />
                  <el-option label="指定部门" value="dept" />
                  <el-option label="指定用户" value="user" />
                </el-select>
                <el-select
                  v-if="rule.ruleType === 'role'"
                  :model-value="getRuleConfig(rule, 'roleIds')"
                  size="small"
                  multiple
                  placeholder="选择角色"
                  @update:model-value="(v) => updateRuleConfig(idx, 'roleIds', v)"
                >
                  <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
                </el-select>
                <el-select
                  v-if="rule.ruleType === 'dept'"
                  :model-value="getRuleConfig(rule, 'deptIds')"
                  size="small"
                  multiple
                  placeholder="选择部门"
                  @update:model-value="(v) => updateRuleConfig(idx, 'deptIds', v)"
                >
                  <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
                </el-select>
                <el-select
                  v-if="rule.ruleType === 'user'"
                  :model-value="getRuleConfig(rule, 'userIds')"
                  size="small"
                  multiple
                  placeholder="选择用户"
                  @update:model-value="(v) => updateRuleConfig(idx, 'userIds', v)"
                >
                  <el-option v-for="u in users" :key="u.id" :label="u.nickname || u.username" :value="u.id" />
                </el-select>
                <el-button type="danger" :icon="Delete" size="small" circle @click="removeRule(idx)" />
              </div>
              <el-button size="small" :icon="Plus" @click="addRule">添加规则</el-button>
            </div>
          </template>
        </el-form>

        <div v-if="selectedNode.type === 'condition'" class="condition-config">
          <div class="section-title">条件配置</div>
          <div v-for="(edge, idx) in conditionEdges" :key="idx" class="condition-edge-item">
            <span class="edge-label">{{ edge.conditionType === 'expression' ? '真' : '跳转' }}</span>
            <el-input v-model="edge.conditionExpr" size="small" placeholder="表达式: amount > 1000" @blur="saveEdgeCondition(edge)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { VueFlow, useVueFlow, type Connection, type NodeChange, type EdgeChange, applyNodeChanges, applyEdgeChanges, addEdge } from '@vue-flow/core'

interface FlowNodeData {
  label?: string
  rawNode?: WorkflowNode
  [key: string]: unknown
}

interface FlowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data?: FlowNodeData
  selected?: boolean
}

interface FlowEdgeData {
  conditionType?: string
  conditionExpr?: string
  [key: string]: unknown
}

interface FlowEdge {
  id: string
  source: string
  target: string
  type?: string
  data?: FlowEdgeData
  label?: string
  sourceHandle?: string | null
}
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/background/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import { ArrowLeft, Delete, Plus, CircleCheckFilled, CircleCloseFilled, Aim, Bell, EditPen } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { workflowApi, type Workflow, type WorkflowNode, type WorkflowEdge, type ApproverRule } from '@/api/workflow'
import { roleApi } from '@/api'
import { deptApi } from '@/api'
import { userApi } from '@/api'

const route = useRoute()
const router = useRouter()
const workflowId = Number(route.params.id)

const roles = ref<{ id: number; name: string }[]>([])
const departments = ref<{ id: number; name: string }[]>([])
const users = ref<{ id: number; nickname?: string; username: string }[]>([])

const { screenToFlowCoordinate } = useVueFlow()

const workflow = ref<Workflow | null>(null)
const draftVersionNo = ref(1)
const publishedVersionNo = ref(0)
const saving = ref(false)
const publishing = ref(false)
const selectedNode = ref<FlowNode | null>(null)
const notifyConfig = reactive({ title: '', content: '' })
const approverRules = ref<ApproverRule[]>([])
const conditionEdges = ref<{ id: string; conditionType: string; conditionExpr: string }[]>([])

const nodeTypes = [
  { type: 'start', label: '开始', icon: CircleCheckFilled },
  { type: 'end', label: '结束', icon: CircleCloseFilled },
  { type: 'condition', label: '条件判断', icon: Aim },
  { type: 'approve', label: '审批节点', icon: EditPen },
  { type: 'notify', label: '发送通知', icon: Bell },
]

const flowNodes = ref<FlowNode[]>([])
const flowEdges = ref<FlowEdge[]>([])

function onDragStart(event: DragEvent, type: string) {
  event.dataTransfer?.setData('application/vueflow', type)
  event.dataTransfer?.setData('text/plain', type)
}

function onDrop(event: DragEvent) {
  const type = event.dataTransfer?.getData('application/vueflow')
  if (!type) return
  const position = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const nodeId = `${type}-${Date.now()}`
  const label = nodeTypeLabel(type)
  flowNodes.value.push({
    id: nodeId,
    type: 'default',
    position,
    data: { label, rawNode: { nodeKey: nodeId, type: type as WorkflowNode['type'], name: label } },
  })
}

function nodeTypeLabel(type: string): string {
  const nt = nodeTypes.find((n) => n.type === type)
  return nt ? nt.label : type
}

function onNodesChange(changes: NodeChange[]) {
  flowNodes.value = applyNodeChanges(changes, flowNodes.value as unknown as never[]) as FlowNode[]
}

function onEdgesChange(changes: EdgeChange[]) {
  flowEdges.value = applyEdgeChanges(changes, flowEdges.value as unknown as never[]) as FlowEdge[]
}

function onConnect(connection: Connection) {
  flowEdges.value = addEdge(
    { ...connection, id: `${connection.source}-${connection.target}`, type: 'smoothstep' },
    flowEdges.value as unknown as never[],
  ) as FlowEdge[]
}

function onNodeClick({ node }: { node: FlowNode }) {
  selectedNode.value = node
  const raw = node.data?.rawNode
  if (node.type === 'notify' && raw?.config) {
    try {
      const cfg = JSON.parse(raw.config)
      notifyConfig.title = cfg.title || ''
      notifyConfig.content = cfg.content || ''
    } catch {
      notifyConfig.title = ''
      notifyConfig.content = ''
    }
  }
  if (node.type === 'approve') loadApproverRules(node.id)
  if (node.type === 'condition') loadConditionEdges(node.id)
}

function onPaneClick() {
  selectedNode.value = null
}

function updateNodeName(val: string) {
  if (selectedNode.value) {
    const node = flowNodes.value.find((n) => n.id === selectedNode.value!.id)
    if (node) node.data = { ...node.data, label: val }
  }
}

function loadApproverRules(nodeId: string) {
  workflowApi.getDesign(workflowId).then((res) => {
    approverRules.value = (res.data?.rules || []).filter((r) => r.nodeKey === nodeId)
  })
}

function loadConditionEdges(nodeId: string) {
  conditionEdges.value = flowEdges.value
    .filter((e) => e.source === nodeId && e.sourceHandle === 'true')
    .map((e) => ({
      id: e.id,
      conditionType: e.data?.conditionType || 'always',
      conditionExpr: e.data?.conditionExpr || '',
    }))
}

function updateRuleType(idx: number, val: string) {
  approverRules.value[idx].ruleType = val as ApproverRule['ruleType']
  approverRules.value[idx].ruleConfig = JSON.stringify(defaultRuleConfig(val as ApproverRule['ruleType']))
  saveRules()
}

function defaultRuleConfig(type: ApproverRule['ruleType']): Record<string, unknown> {
  switch (type) {
    case 'direct_leader':
      return { level: 1 }
    case 'role':
      return { roleIds: [] }
    case 'dept':
      return { deptIds: [] }
    case 'user':
      return { userIds: [] }
    default:
      return {}
  }
}

function getRuleConfig(rule: ApproverRule, key: string): number[] {
  try {
    const config = rule.ruleConfig ? JSON.parse(rule.ruleConfig) : {}
    return config[key] || []
  } catch {
    return []
  }
}

function updateRuleConfig(idx: number, key: string, values: number[]) {
  const rule = approverRules.value[idx]
  try {
    const config = rule.ruleConfig ? JSON.parse(rule.ruleConfig) : {}
    config[key] = values
    rule.ruleConfig = JSON.stringify(config)
  } catch {
    rule.ruleConfig = JSON.stringify({ [key]: values })
  }
  saveRules()
}

function addRule() {
  const nodeKey = selectedNode.value?.id || ''
  approverRules.value.push({ nodeKey, ruleType: 'direct_leader', ruleConfig: '{"level":1}', sort: approverRules.value.length, name: '' })
  saveRules()
}

function removeRule(idx: number) {
  const rule = approverRules.value[idx]
  if (rule.id) workflowApi.deleteApproverRule(workflowId, rule.id)
  approverRules.value.splice(idx, 1)
  saveRules()
}

function saveRules() {
  const nodeKey = selectedNode.value?.id || ''
  for (const rule of approverRules.value) {
    workflowApi.upsertApproverRule(workflowId, nodeKey, rule)
  }
}

function saveEdgeCondition(edge: { id: string; conditionType: string; conditionExpr: string }) {
  const dbEdge = flowEdges.value.find((e) => e.id === edge.id)
  if (!dbEdge) return
  workflowApi.upsertEdge(workflowId, {
    sourceNodeKey: dbEdge.source,
    targetNodeKey: dbEdge.target,
    conditionType: 'expression',
    conditionExpr: edge.conditionExpr || undefined,
  })
}

async function handleSave() {
  saving.value = true
  try {
    for (const node of flowNodes.value) {
      const rawNode = node.data?.rawNode
      const config = rawNode?.type === 'notify' ? JSON.stringify({ title: notifyConfig.title, content: notifyConfig.content }) : rawNode?.config
      await workflowApi.upsertNode(workflowId, {
        nodeKey: node.id,
        name: node.data?.label || node.id,
        type: (rawNode?.type || 'start') as 'start' | 'end' | 'condition' | 'approve' | 'notify',
        config: config || undefined,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      })
    }
    for (const edge of flowEdges.value) {
      await workflowApi.upsertEdge(workflowId, {
        sourceNodeKey: edge.source,
        targetNodeKey: edge.target,
        conditionType: (edge.data?.conditionType || 'always') as 'always' | 'expression',
        conditionExpr: edge.data?.conditionExpr || undefined,
      })
    }
    ElMessage.success('保存成功')
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

function handlePublish() {
  publishing.value = true
  workflowApi
    .publish(workflowId)
    .then(() => {
      ElMessage.success('发布成功')
      return workflowApi.getById(workflowId)
    })
    .then((res) => {
      workflow.value = res.data!
      publishedVersionNo.value = res.data?.publishedVersionId ?? 0
      draftVersionNo.value = res.data?.draftVersionId ?? 1
    })
    .catch(() => ElMessage.error('发布失败，请检查流程设计完整性'))
    .finally(() => {
      publishing.value = false
    })
}

function goBack() {
  router.push('/workflows')
}

onMounted(async () => {
  roleApi
    .getAll()
    .then((r) => {
      roles.value = r.data || []
    })
    .catch(() => {})
  deptApi
    .list()
    .then((r) => {
      departments.value = r.data || []
    })
    .catch(() => {})
  userApi
    .list({ page: 1, pageSize: 200 })
    .then((r) => {
      users.value = r.data?.rows || []
    })
    .catch(() => {})

  try {
    const res = await workflowApi.getById(workflowId)
    workflow.value = res.data!
    draftVersionNo.value = res.data?.draftVersionId ?? 1
    publishedVersionNo.value = res.data?.publishedVersionId ?? 0

    const design = await workflowApi.getDesign(workflowId)
    flowNodes.value = (design.data?.nodes || []).map((n: WorkflowNode) => ({
      id: n.nodeKey,
      type: 'default',
      position: { x: n.x || 0, y: n.y || 0 },
      data: { label: n.name, rawNode: n },
    }))
    flowEdges.value = (design.data?.edges || []).map((e: WorkflowEdge) => ({
      id: `${e.sourceNodeKey}-${e.targetNodeKey}`,
      source: e.sourceNodeKey,
      target: e.targetNodeKey,
      type: 'smoothstep',
      data: { conditionType: e.conditionType, conditionExpr: e.conditionExpr },
      label: e.conditionType === 'expression' ? e.conditionExpr || '' : '',
    }))
  } catch {
    ElMessage.error('加载失败')
  }
})
</script>

<style lang="scss" scoped>
.workflow-designer {
  height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
}
.designer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    .header-title {
      font-size: 16px;
      font-weight: 600;
    }
  }
  .header-right {
    display: flex;
    gap: 8px;
  }
}
.designer-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.node-palette {
  width: 160px;
  padding: 12px;
  border-right: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  .palette-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .palette-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    margin-bottom: 4px;
    border-radius: 6px;
    cursor: grab;
    font-size: 13px;
    &:hover {
      background: var(--el-fill-color-light);
    }
  }
}
.canvas-wrapper {
  flex: 1;
  position: relative;
}
.node-config-panel {
  width: 280px;
  padding: 12px;
  border-left: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  overflow-y: auto;
  .panel-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 12px;
  }
  .section-title {
    font-size: 12px;
    font-weight: 600;
    margin: 12px 0 8px;
    color: var(--el-text-color-secondary);
  }
  .rule-item {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .approver-rules-section,
  .condition-config {
    margin-top: 12px;
  }
  .condition-edge-item {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    .edge-label {
      font-size: 12px;
      min-width: 20px;
    }
  }
}
</style>
