/**
 * 工作流图谱缓存
 *
 * 引擎在 execute / resumeAfterApproval / 每次 advance 都会调用 loadGraph(versionId)，
 * 每调用一次需 3 次 findAll。多步审批下会产生大量重复加载，因此按 versionId 缓存图谱。
 *
 * 重要：缓存层会 JSON 序列化（L1 clone 与 L2 Redis），Map 无法被 JSON 还原，
 * 因此缓存只存「原始数组」(nodes/edges/rules)，Map 结构在每次加载后由 buildGraph 重建。
 * 这样 L1 / L2 / DB 三态一致，不会因序列化丢结构。
 *
 * 失效策略：任何会改变某 versionId 图谱结构的写操作（设计保存 / 节点边规则增删改）
 * 都必须调用 invalidateWorkflowGraph(versionId)。此外缓存带 TTL 作为兜底，
 * 即使个别写路径遗漏失效，陈旧度也被限制在 TTL 内。
 */
import WorkflowNode from '../models/WorkflowNode.js'
import WorkflowEdge from '../models/WorkflowEdge.js'
import WorkflowApproverRule from '../models/WorkflowApproverRule.js'
import { createCache } from '../utils/cache.js'

export interface Graph {
  nodeMap: Map<string, WorkflowNode>
  outEdges: Map<string, WorkflowEdge[]>
  inEdges: Map<string, WorkflowEdge[]>
  indegree: Map<string, number>
  rulesByNode: Map<string, WorkflowApproverRule[]>
}

/** 可 JSON 序列化的原始图谱（缓存实际存储的形态） */
interface GraphRaw {
  nodes: any[]
  edges: any[]
  rules: any[]
}

/** 从原始数组重建图谱 Map 结构（每次加载后执行，成本 O(n+e+r)） */
function buildGraph(raw: GraphRaw): Graph {
  const nodeMap = new Map<string, WorkflowNode>()
  const outEdges = new Map<string, WorkflowEdge[]>()
  const inEdges = new Map<string, WorkflowEdge[]>()
  const indegree = new Map<string, number>()
  const rulesByNode = new Map<string, WorkflowApproverRule[]>()

  for (const n of raw.nodes) {
    nodeMap.set(n.nodeKey, n)
    outEdges.set(n.nodeKey, [])
    inEdges.set(n.nodeKey, [])
    indegree.set(n.nodeKey, 0)
    rulesByNode.set(n.nodeKey, [])
  }
  for (const e of raw.edges) {
    outEdges.get(e.sourceNodeKey)?.push(e)
    inEdges.get(e.targetNodeKey)?.push(e)
    indegree.set(e.targetNodeKey, (indegree.get(e.targetNodeKey) ?? 0) + 1)
  }
  for (const r of raw.rules) {
    rulesByNode.get(r.nodeKey)?.push(r)
  }

  return { nodeMap, outEdges, inEdges, indegree, rulesByNode }
}

/** 从数据库加载某版本的原始图谱（无缓存，纯 DB 读取） */
export async function loadGraphRawFromDb(versionId: number): Promise<GraphRaw> {
  const [nodes, edges, rules] = await Promise.all([
    WorkflowNode.findAll({ where: { versionId } as any }),
    WorkflowEdge.findAll({ where: { versionId } as any }),
    WorkflowApproverRule.findAll({ where: { versionId } as any }),
  ])
  return { nodes, edges, rules }
}

const graphCache = createCache<GraphRaw>({
  max: 500,
  maxAgeMs: 5 * 60 * 1000,
  // 测试环境默认禁用（见 utils/cache.ts），保证单测确定性
})

/** 带缓存的图谱加载：缓存原始数组，命中后重建 Map 结构返回 */
export async function loadGraphCached(versionId: number): Promise<Graph> {
  const raw = await graphCache.getOrSet(String(versionId), () => loadGraphRawFromDb(versionId))
  return buildGraph(raw)
}

/** 失效指定版本的图谱缓存（图谱结构变更后调用） */
export function invalidateWorkflowGraph(versionId: number): void {
  graphCache.del(String(versionId))
}
