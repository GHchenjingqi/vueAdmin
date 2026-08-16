<template>
  <div class="workflow-designer">
    <div class="designer-header">
      <div class="header-left">
        <el-button text :icon="ArrowLeft" @click="goBack">
          {{ t('workflow.designer.back') }}
        </el-button>
        <span class="header-title">{{ workflow?.name || t('workflow.designer.title') }}</span>
        <el-tag v-if="workflow?.publishedVersionId" type="success" size="small">{{ t('workflow.designer.online') }} V{{ publishedVersionNo }}</el-tag>
        <el-tag v-if="workflow?.draftVersionId" type="warning" size="small">{{ t('workflow.designer.draft') }} V{{ draftVersionNo }}</el-tag>
      </div>
      <div class="header-right">
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ t('common.save') }}
        </el-button>
        <el-button type="success" :loading="publishing" @click="handlePublish">
          {{ t('common.publish') }}
        </el-button>
      </div>
    </div>

    <div class="designer-body">
      <div class="node-palette">
        <div class="palette-title">
          {{ t('workflow.designer.nodeTypes') }}
        </div>
        <div
          v-for="nt in nodeTypes"
          :key="nt.type"
          class="palette-item"
          draggable="true"
          @dragstart="onDragStart($event, nt.type)"
          @dblclick="addNodeByType(nt.type)"
        >
          <el-icon><component :is="nt.icon" /></el-icon>
          <span>{{ nt.label }}</span>
        </div>
        <div class="palette-tip">
          {{ t('workflow.designer.dragTip') }}
        </div>
      </div>

      <div class="canvas-wrapper" @drop="onDrop" @dragover.prevent>
        <VueFlow
          :nodes="flowNodes"
          :edges="flowEdges"
          :node-types="nodeTypesMap"
          fit-view-on-init
          :snap-to-grid="true"
          :snap-grid="[16, 16]"
          @nodes-change="onNodesChange"
          @edges-change="onEdgesChange"
          @node-click="onNodeClick"
          @edge-click="onEdgeClick"
          @pane-click="onPaneClick"
          @connect="onConnect"
        >
          <Background />
          <Controls />
          <MiniMap />
        </VueFlow>
      </div>

      <div class="node-config-panel">
        <!-- 节点配置 -->
        <template v-if="selectedNode">
          <div class="panel-title">
            <span>{{ t('workflow.designer.nodeConfig') }}</span>
            <el-button type="danger" :icon="Delete" size="small" link @click="removeSelectedNode">
              {{ t('common.delete') }}
            </el-button>
          </div>
          <el-form label-width="80px" size="small">
            <el-form-item :label="t('workflow.designer.name')">
              <el-input :model-value="selectedNode.data?.label" @update:model-value="updateNodeName($event)" />
            </el-form-item>
            <el-form-item :label="t('workflow.designer.type')">
              <el-tag>{{ nodeTypeLabel(selectedNode.type) }}</el-tag>
            </el-form-item>

            <template v-if="selectedNode.type === 'notify'">
              <el-form-item :label="t('workflow.designer.notifyTitle')">
                <el-input v-model="notifyConfig.title" :placeholder="t('workflow.designer.notifyTitlePlaceholder')" @update:model-value="markDirty" />
              </el-form-item>
              <el-form-item :label="t('workflow.designer.notifyContent')">
                <el-input
                  v-model="notifyConfig.content"
                  type="textarea"
                  :rows="3"
                  :placeholder="t('workflow.designer.notifyContentPlaceholder')"
                  @update:model-value="markDirty"
                />
              </el-form-item>
            </template>

            <template v-if="selectedNode.type === 'approve'">
              <div class="approver-rules-section">
                <div class="section-title">
                  {{ t('workflow.designer.approverRules') }}
                </div>
                <div v-for="(rule, idx) in approverRules" :key="idx" class="rule-item">
                  <el-select :model-value="rule.ruleType" size="small" style="width: 140px" @update:model-value="(v) => updateRuleType(idx, v)">
                    <el-option :label="t('workflow.designer.creator')" value="creator" />
                    <el-option :label="t('workflow.designer.directLeader')" value="direct_leader" />
                    <el-option :label="t('workflow.designer.deptManager')" value="dept_manager" />
                    <el-option :label="t('workflow.designer.byRole')" value="role" />
                    <el-option :label="t('workflow.designer.byDept')" value="dept" />
                    <el-option :label="t('workflow.designer.byUser')" value="user" />
                  </el-select>
                  <el-select
                    v-if="rule.ruleType === 'role'"
                    :model-value="getRuleConfig(rule, 'roleIds')"
                    size="small"
                    multiple
                    :placeholder="t('workflow.designer.selectRole')"
                    @update:model-value="(v) => updateRuleConfig(idx, 'roleIds', v)"
                  >
                    <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
                  </el-select>
                  <el-select
                    v-if="rule.ruleType === 'dept'"
                    :model-value="getRuleConfig(rule, 'deptIds')"
                    size="small"
                    multiple
                    :placeholder="t('workflow.designer.selectDept')"
                    @update:model-value="(v) => updateRuleConfig(idx, 'deptIds', v)"
                  >
                    <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
                  </el-select>
                  <el-select
                    v-if="rule.ruleType === 'user'"
                    :model-value="getRuleConfig(rule, 'userIds')"
                    size="small"
                    multiple
                    :placeholder="t('workflow.designer.selectUser')"
                    @update:model-value="(v) => updateRuleConfig(idx, 'userIds', v)"
                  >
                    <el-option v-for="u in users" :key="u.id" :label="u.nickname || u.username" :value="u.id" />
                  </el-select>
                  <el-button type="danger" :icon="Delete" size="small" circle @click="removeRule(idx)" />
                </div>
                <el-button size="small" :icon="Plus" @click="addRule">
                  {{ t('workflow.designer.addRule') }}
                </el-button>
              </div>
            </template>

            <template v-if="selectedNode.type === 'condition'">
              <div class="condition-config">
                <div class="section-title">
                  {{ t('workflow.designer.conditionConfig') }}
                </div>
                <div v-if="conditionEdges.length === 0" class="empty-tip">
                  {{ t('workflow.designer.conditionEmptyTip') }}
                </div>
                <div v-for="edge in conditionEdges" :key="edge.id" class="condition-edge-item">
                  <el-tag :type="edge.sourceHandle === 'true' ? 'success' : 'danger'" size="small" effect="plain">
                    {{ edge.sourceHandle === 'true' ? t('workflow.designer.trueBranch') : t('workflow.designer.falseBranch') }}
                  </el-tag>
                  <span class="edge-target">→ {{ edge.target }}</span>
                  <el-input
                    v-model="edge.conditionExpr"
                    size="small"
                    :placeholder="t('workflow.designer.conditionExpr')"
                    @update:model-value="onConditionInput(edge)"
                  />
                  <el-button type="danger" :icon="Delete" size="small" circle @click="removeEdge(edge)" />
                </div>
              </div>
            </template>
          </el-form>
        </template>

        <!-- 边配置 -->
        <template v-else-if="selectedEdge">
          <div class="panel-title">
            <span>{{ t('workflow.designer.edge') }}</span>
            <el-button type="danger" :icon="Delete" size="small" link @click="removeSelectedEdge">
              {{ t('common.delete') }}
            </el-button>
          </div>
          <el-form label-width="80px" size="small">
            <el-form-item :label="t('workflow.designer.source')">
              <el-tag size="small">
                {{ selectedEdge.source }}
              </el-tag>
            </el-form-item>
            <el-form-item :label="t('workflow.designer.target')">
              <el-tag size="small">
                {{ selectedEdge.target }}
              </el-tag>
            </el-form-item>
            <el-form-item v-if="selectedEdge.sourceHandle" :label="t('workflow.designer.branch')">
              <el-tag :type="selectedEdge.sourceHandle === 'true' ? 'success' : 'danger'" size="small">
                {{ selectedEdge.sourceHandle === 'true' ? t('workflow.designer.trueBranch') : t('workflow.designer.falseBranch') }}
              </el-tag>
            </el-form-item>
            <el-form-item :label="t('workflow.designer.condition')">
              <el-input
                :model-value="selectedEdge.data?.conditionExpr"
                :placeholder="t('workflow.designer.conditionExprPlaceholder')"
                @update:model-value="updateEdgeExpr($event)"
              />
            </el-form-item>
          </el-form>
        </template>

        <div v-else class="panel-empty">
          <el-icon :size="28">
            <EditPen />
          </el-icon>
          <p>{{ t('workflow.designer.emptyTip') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import { markRaw } from 'vue'
import {
  VueFlow,
  useVueFlow,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeMouseEvent,
  type EdgeMouseEvent,
  type NodeTypesObject,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import { ArrowLeft, Delete, Plus, CircleCheckFilled, CircleCloseFilled, Aim, Bell, EditPen } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { workflowApi, type Workflow, type WorkflowNode, type WorkflowEdge, type ApproverRule } from '@/api/workflow'
import { roleApi, deptApi, userApi } from '@/api'
import { useI18n } from '@/i18n'
import WorkflowNodeComp from './workflow/WorkflowNode.vue'

const { t } = useI18n()

interface FlowNodeData {
  label?: string
  rawNode?: WorkflowNode
  approverCount?: number
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
  sourceHandle?: string | null
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
  targetHandle?: string | null
  selected?: boolean
}

interface ConditionEdgeItem {
  id: string
  sourceHandle: string
  target: string
  conditionType: string
  conditionExpr: string
}

const route = useRoute()
const router = useRouter()
const workflowId = Number(route.params.id)

const roles = ref<{ id: number; name: string }[]>([])
const departments = ref<{ id: number; name: string }[]>([])
const users = ref<{ id: number; nickname?: string; username: string }[]>([])

const { screenToFlowCoordinate } = useVueFlow()

const nodeTypesMap: NodeTypesObject = {
  start: markRaw(WorkflowNodeComp),
  end: markRaw(WorkflowNodeComp),
  condition: markRaw(WorkflowNodeComp),
  approve: markRaw(WorkflowNodeComp),
  notify: markRaw(WorkflowNodeComp),
} as unknown as NodeTypesObject

const workflow = ref<Workflow | null>(null)
const draftVersionNo = ref(1)
const publishedVersionNo = ref(0)
const saving = ref(false)
const publishing = ref(false)
const dirty = ref(false)
const selectedNode = ref<FlowNode | null>(null)
const selectedEdge = ref<FlowEdge | null>(null)
const notifyConfig = reactive({ title: '', content: '' })
const approverRules = ref<ApproverRule[]>([])
const conditionEdges = ref<ConditionEdgeItem[]>([])

// 草稿快照（用于保存 diff：识别删除项）
const loadedNodeKeys = ref<Set<string>>(new Set())
const loadedEdges = ref<FlowEdge[]>([])
const loadedRulesByNode = ref<Map<string, ApproverRule[]>>(new Map())
// 当前各审批节点的规则（本地编辑，保存时统一提交）
const rulesByNode = ref<Map<string, ApproverRule[]>>(new Map())

const nodeTypes = [
  { type: 'start', label: t('workflow.designer.start'), icon: CircleCheckFilled },
  { type: 'end', label: t('workflow.designer.end'), icon: CircleCloseFilled },
  { type: 'condition', label: t('workflow.designer.conditionNode'), icon: Aim },
  { type: 'approve', label: t('workflow.designer.approve'), icon: EditPen },
  { type: 'notify', label: t('workflow.designer.notify'), icon: Bell },
]

const flowNodes = ref<FlowNode[]>([])
const flowEdges = ref<FlowEdge[]>([])

function markDirty() {
  dirty.value = true
}

function onDragStart(event: DragEvent, type: string) {
  event.dataTransfer?.setData('application/vueflow', type)
  event.dataTransfer?.setData('text/plain', type)
}

function addNodeByType(type: string) {
  const position = { x: 120 + Math.random() * 120, y: 80 + Math.random() * 120 }
  addNode(type, position)
}

function onDrop(event: DragEvent) {
  const type = event.dataTransfer?.getData('application/vueflow')
  if (!type) return
  const position = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  addNode(type, position)
}

function addNode(type: string, position: { x: number; y: number }) {
  const nodeId = `${type}-${Date.now()}`
  const label = nodeTypeLabel(type)
  const node: FlowNode = {
    id: nodeId,
    type,
    position,
    data: { label, rawNode: { nodeKey: nodeId, type: type as WorkflowNode['type'], name: label } },
  }
  flowNodes.value.push(node)
  selectNode(node)
  markDirty()
}

function nodeTypeLabel(type: string): string {
  const nt = nodeTypes.find((n) => n.type === type)
  return nt ? nt.label : type
}

function onNodesChange(changes: NodeChange[]) {
  flowNodes.value = applyNodeChanges(changes, flowNodes.value as unknown as never[]) as FlowNode[]
  if (changes.some((c) => c.type !== 'select')) markDirty()
}

function onEdgesChange(changes: EdgeChange[]) {
  flowEdges.value = applyEdgeChanges(changes, flowEdges.value as unknown as never[]) as FlowEdge[]
  if (changes.some((c) => c.type !== 'select')) markDirty()
}

function onConnect(connection: Connection) {
  const edge: FlowEdge = {
    ...connection,
    id: `${connection.source}-${connection.sourceHandle || 'out'}-${connection.target}`,
    type: 'smoothstep',
    data: { sourceHandle: connection.sourceHandle, conditionType: 'always' },
  }
  flowEdges.value = addEdge(edge, flowEdges.value as unknown as never[]) as FlowEdge[]
  if (selectedNode.value?.type === 'condition') loadConditionEdges(selectedNode.value.id)
  markDirty()
}

function onNodeClick({ node }: NodeMouseEvent) {
  selectNode(node as unknown as FlowNode)
}

function onEdgeClick({ edge }: EdgeMouseEvent) {
  flushNotifyConfig()
  selectedNode.value = null
  selectedEdge.value = edge as unknown as FlowEdge
}

function onPaneClick() {
  flushNotifyConfig()
  selectedNode.value = null
  selectedEdge.value = null
}

function flushNotifyConfig() {
  const node = selectedNode.value
  if (node && node.type === 'notify' && node.data?.rawNode) {
    node.data.rawNode.config = JSON.stringify({ title: notifyConfig.title, content: notifyConfig.content })
    node.data = { ...node.data }
  }
}

function selectNode(node: FlowNode) {
  flushNotifyConfig()
  selectedEdge.value = null
  selectedNode.value = node
  resetLocalConfig()
  const raw = node.data?.rawNode
  if (node.type === 'notify' && raw?.config) {
    const cfg = JSON.parse(raw.config)
    notifyConfig.title = cfg.title || ''
    notifyConfig.content = cfg.content || ''
  }
  if (node.type === 'approve') {
    approverRules.value = rulesByNode.value.get(node.id) || []
  }
  if (node.type === 'condition') loadConditionEdges(node.id)
}

function resetLocalConfig() {
  notifyConfig.title = ''
  notifyConfig.content = ''
  approverRules.value = []
  conditionEdges.value = []
}

function updateNodeName(val: string) {
  if (!selectedNode.value) return
  const node = flowNodes.value.find((n) => n.id === selectedNode.value!.id)
  if (node) node.data = { ...node.data, label: val }
  markDirty()
}

function loadConditionEdges(nodeId: string) {
  conditionEdges.value = flowEdges.value
    .filter((e) => e.source === nodeId)
    .map((e) => ({
      id: e.id,
      sourceHandle: e.sourceHandle || (e.data?.sourceHandle as string) || 'true',
      target: e.target,
      conditionType: e.data?.conditionType || 'always',
      conditionExpr: e.data?.conditionExpr || '',
    }))
}

function updateApproverBadge(nodeId: string, count: number) {
  const node = flowNodes.value.find((n) => n.id === nodeId)
  if (node) node.data = { ...node.data, approverCount: count }
}

function updateRuleType(idx: number, val: string) {
  approverRules.value[idx].ruleType = val as ApproverRule['ruleType']
  approverRules.value[idx].ruleConfig = JSON.stringify(defaultRuleConfig(val as ApproverRule['ruleType']))
  syncRulesToMap()
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
  const config = rule.ruleConfig ? JSON.parse(rule.ruleConfig) : {}
  return config[key] || []
}

function updateRuleConfig(idx: number, key: string, values: number[]) {
  const rule = approverRules.value[idx]
  const config = rule.ruleConfig ? JSON.parse(rule.ruleConfig) : {}
  config[key] = values
  rule.ruleConfig = JSON.stringify(config)
  syncRulesToMap()
}

function addRule() {
  const nodeKey = selectedNode.value?.id || ''
  approverRules.value.push({ nodeKey, ruleType: 'direct_leader', ruleConfig: '{"level":1}', sort: approverRules.value.length, name: '' })
  updateApproverBadge(nodeKey, approverRules.value.length)
  syncRulesToMap()
}

function removeRule(idx: number) {
  approverRules.value.splice(idx, 1)
  const nodeKey = selectedNode.value?.id || ''
  updateApproverBadge(nodeKey, approverRules.value.length)
  syncRulesToMap()
}

function syncRulesToMap() {
  if (selectedNode.value) {
    rulesByNode.value.set(selectedNode.value.id, [...approverRules.value])
  }
  markDirty()
}

function onConditionInput(edge: ConditionEdgeItem) {
  const dbEdge = flowEdges.value.find((e) => e.id === edge.id)
  if (dbEdge) {
    dbEdge.data = {
      ...dbEdge.data,
      sourceHandle: edge.sourceHandle,
      conditionType: edge.conditionExpr ? 'expression' : 'always',
      conditionExpr: edge.conditionExpr,
    }
    dbEdge.label = edge.conditionExpr
  }
  markDirty()
}

function updateEdgeExpr(val: string) {
  if (!selectedEdge.value) return
  selectedEdge.value.data = { ...selectedEdge.value.data, conditionExpr: val }
  selectedEdge.value.label = val
  markDirty()
}

async function removeSelectedNode() {
  const node = selectedNode.value
  if (!node) return
  await ElMessageBox.confirm(t('workflow.designer.deleteNodeConfirm', { name: node.data?.label || node.id }), t('common.tip'), { type: 'warning' })
  const nodeId = node.id
  flowEdges.value = flowEdges.value.filter((e) => e.source !== nodeId && e.target !== nodeId)
  flowNodes.value = flowNodes.value.filter((n) => n.id !== nodeId)
  rulesByNode.value.delete(nodeId)
  selectedNode.value = null
  markDirty()
}

function removeEdge(edge: ConditionEdgeItem) {
  const dbEdge = flowEdges.value.find((e) => e.id === edge.id)
  if (dbEdge) removeEdgeFromGraph(dbEdge)
}

function removeSelectedEdge() {
  const edge = selectedEdge.value
  if (edge) removeEdgeFromGraph(edge)
  selectedEdge.value = null
}

function removeEdgeFromGraph(edge: FlowEdge) {
  flowEdges.value = flowEdges.value.filter((e) => e.id !== edge.id)
  if (selectedNode.value?.type === 'condition') loadConditionEdges(selectedNode.value.id)
  markDirty()
}

async function handleSave() {
  saving.value = true
  try {
    flushNotifyConfig()
    const currentKeys = new Set(flowNodes.value.map((n) => n.id))
    const currentEdgeIds = new Set(flowEdges.value.map((e) => e.id))

    // 删除已移除的节点（连带边与规则由后端清理）
    for (const key of loadedNodeKeys.value) {
      if (!currentKeys.has(key)) await workflowApi.deleteNode(workflowId, key)
    }
    // 删除已移除的边
    for (const e of loadedEdges.value) {
      if (!currentEdgeIds.has(e.id)) await workflowApi.deleteEdge(workflowId, e.source, e.target)
    }
    // upsert 节点
    for (const node of flowNodes.value) {
      const rawNode = node.data?.rawNode
      await workflowApi.upsertNode(workflowId, {
        nodeKey: node.id,
        name: node.data?.label || node.id,
        type: (rawNode?.type || 'start') as 'start' | 'end' | 'condition' | 'approve' | 'notify',
        config: rawNode?.config || undefined,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      })
    }
    // upsert 边
    for (const edge of flowEdges.value) {
      await workflowApi.upsertEdge(workflowId, {
        sourceNodeKey: edge.source,
        targetNodeKey: edge.target,
        sourceHandle: edge.sourceHandle || (edge.data?.sourceHandle as string) || undefined,
        conditionType: (edge.data?.conditionType || 'always') as 'always' | 'expression',
        conditionExpr: edge.data?.conditionExpr || undefined,
      })
    }
    // 审批人规则 diff（新增/更新 + 删除）
    for (const [nodeKey, current] of rulesByNode.value) {
      const loaded = loadedRulesByNode.value.get(nodeKey) || []
      for (const rule of current) {
        await workflowApi.upsertApproverRule(workflowId, nodeKey, rule)
      }
      const currentIds = new Set(current.filter((r) => r.id).map((r) => r.id))
      for (const rule of loaded) {
        if (rule.id && !currentIds.has(rule.id)) await workflowApi.deleteApproverRule(workflowId, rule.id)
      }
    }

    loadedNodeKeys.value = new Set(flowNodes.value.map((n) => n.id))
    loadedEdges.value = flowEdges.value.map((e) => ({ ...e }))
    loadedRulesByNode.value = new Map(Array.from(rulesByNode.value.entries()).map(([k, v]) => [k, v.map((r) => ({ ...r }))] as [string, ApproverRule[]]))
    dirty.value = false
    ElMessage.success(t('workflow.designer.saveSuccess'))
  } catch {
    ElMessage.error(t('workflow.designer.saveFailed'))
  } finally {
    saving.value = false
  }
}

function handlePublish() {
  publishing.value = true
  workflowApi
    .publish(workflowId)
    .then(() => ElMessage.success(t('common.publish')))
    .then(() => reloadDesign())
    .catch(() => ElMessage.error(t('workflow.designer.publishFailed')))
    .finally(() => {
      publishing.value = false
    })
}

async function reloadDesign() {
  const res = await workflowApi.getById(workflowId)
  workflow.value = res.data!
  draftVersionNo.value = res.data?.draftVersionId ?? 1
  publishedVersionNo.value = res.data?.publishedVersionId ?? 0
  await loadDesign()
  dirty.value = false
}

async function loadDesign() {
  const design = await workflowApi.getDesign(workflowId)
  const rules = design.data?.rules || []
  const ruleCountMap = new Map<string, number>()
  const rulesMap = new Map<string, ApproverRule[]>()
  for (const r of rules) {
    ruleCountMap.set(r.nodeKey, (ruleCountMap.get(r.nodeKey) || 0) + 1)
    const arr = rulesMap.get(r.nodeKey) || []
    arr.push(r)
    rulesMap.set(r.nodeKey, arr)
  }
  loadedRulesByNode.value = new Map(rulesMap)
  rulesByNode.value = new Map(Array.from(rulesMap.entries()).map(([k, v]) => [k, v.map((r) => ({ ...r }))] as [string, ApproverRule[]]))

  flowNodes.value = (design.data?.nodes || []).map((n: WorkflowNode) => ({
    id: n.nodeKey,
    type: n.type,
    position: { x: n.x || 0, y: n.y || 0 },
    data: { label: n.name, rawNode: n, approverCount: ruleCountMap.get(n.nodeKey) || 0 },
  }))
  flowEdges.value = (design.data?.edges || []).map((e: WorkflowEdge) => ({
    id: `${e.sourceNodeKey}-${e.sourceHandle || 'out'}-${e.targetNodeKey}`,
    source: e.sourceNodeKey,
    target: e.targetNodeKey,
    sourceHandle: e.sourceHandle || null,
    type: 'smoothstep',
    data: { sourceHandle: e.sourceHandle, conditionType: e.conditionType, conditionExpr: e.conditionExpr },
    label: e.conditionType === 'expression' ? e.conditionExpr || '' : '',
  }))

  loadedNodeKeys.value = new Set(flowNodes.value.map((n) => n.id))
  loadedEdges.value = flowEdges.value.map((e) => ({ ...e }))
  selectedNode.value = null
  selectedEdge.value = null
}

async function confirmLeave(): Promise<boolean> {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm(t('workflow.designer.unsavedTip'), t('common.tip'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
    return true
  } catch {
    return false
  }
}

async function goBack() {
  if (!(await confirmLeave())) return
  router.push('/workflows')
}

onBeforeRouteLeave(async () => {
  return await confirmLeave()
})

onMounted(async () => {
  roleApi.getAll().then((r) => {
    roles.value = r.data || []
  })
  deptApi.list().then((r) => {
    departments.value = r.data || []
  })
  userApi.list({ page: 1, pageSize: 200 }).then((r) => {
    users.value = r.data?.rows || []
  })

  if (!workflowId || isNaN(workflowId)) {
    ElMessage.error(t('workflow.designer.invalidId'))
    router.push('/workflows')
    return
  }

  try {
    const res = await workflowApi.getById(workflowId)
    workflow.value = res.data!
    draftVersionNo.value = res.data?.draftVersionId ?? 1
    publishedVersionNo.value = res.data?.publishedVersionId ?? 0
    await loadDesign()
  } catch {
    ElMessage.error(t('workflow.designer.loadFailed'))
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
  .palette-tip {
    margin-top: 8px;
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }
}
.canvas-wrapper {
  flex: 1;
  position: relative;
}
.node-config-panel {
  width: 300px;
  padding: 12px;
  border-left: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  overflow-y: auto;
  .panel-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 12px;
  }
  .panel-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--el-text-color-secondary);
    gap: 8px;
  }
  .section-title {
    font-size: 12px;
    font-weight: 600;
    margin: 12px 0 8px;
    color: var(--el-text-color-secondary);
  }
  .empty-tip {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-bottom: 8px;
  }
  .rule-item {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }
  .approver-rules-section,
  .condition-config {
    margin-top: 12px;
  }
  .condition-edge-item {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    .edge-target {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
    }
  }
}
</style>
