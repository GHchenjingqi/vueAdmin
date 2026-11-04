import sequelize from '../config/database.js'
import Workflow from '../models/Workflow.js'
import WorkflowVersion from '../models/WorkflowVersion.js'
import WorkflowNode from '../models/WorkflowNode.js'
import WorkflowEdge from '../models/WorkflowEdge.js'
import WorkflowBinding from '../models/WorkflowBinding.js'
import { logInfo } from '../utils/fileLogger.js'

/**
 * 种入「商品发布审批流」工作流定义 + 绑定（bindingKey = shop-publish）。
 *
 * 流程：开始 → 运营审批(approve) → 结束。审批节点默认「无审批人规则」时由引擎自动通过，
 * 运营可在工作流设计器中为该 approve 节点追加审批人规则升级为人工审批。
 * 审批结束后由引擎回调 POST /api/v1/shop/workflow-callback 将 SPU 状态置为 published / rejected。
 */
export async function up(): Promise<void> {
  try {
    const existing = await WorkflowBinding.findOne({ where: { bindingKey: 'shop-publish' } })
    if (existing) {
      logInfo('商品发布审批流已存在，跳过种子')
      return
    }

    const tenantId = 1
    const baseUrl = process.env.APP_BASE_URL || process.env.APP_URL || 'http://localhost:5173'

    await sequelize.transaction(async (t) => {
      const wf = await Workflow.create(
        { name: '商品发布审批流', description: '跨境商品发布审批（合规卡点 + 运营审批）', status: 1, publishedVersionId: 0, createdBy: 0, tenantId },
        { transaction: t },
      )
      const ver = await WorkflowVersion.create(
        { workflowId: wf.id, versionNo: 1, status: 'published', publishedAt: new Date(), publishedBy: 0 },
        { transaction: t },
      )
      await wf.update({ publishedVersionId: ver.id }, { transaction: t })

      await WorkflowNode.bulkCreate(
        [
          { workflowId: wf.id, versionId: ver.id, nodeKey: 'start', name: '开始', type: 'start', config: '{}' },
          { workflowId: wf.id, versionId: ver.id, nodeKey: 'approve', name: '运营审批', type: 'approve', config: '{}' },
          { workflowId: wf.id, versionId: ver.id, nodeKey: 'end', name: '结束', type: 'end', config: '{}' },
        ],
        { transaction: t },
      )

      await WorkflowEdge.bulkCreate(
        [
          { workflowId: wf.id, versionId: ver.id, sourceNodeKey: 'start', targetNodeKey: 'approve', sourceHandle: 'source', conditionType: 'always', conditionExpr: null },
          { workflowId: wf.id, versionId: ver.id, sourceNodeKey: 'approve', targetNodeKey: 'end', sourceHandle: 'source', conditionType: 'always', conditionExpr: null },
        ],
        { transaction: t },
      )

      await WorkflowBinding.create(
        {
          workflowId: wf.id,
          bindingKey: 'shop-publish',
          entityName: 'ShopSpu',
          formKey: null,
          callbackUrl: `${baseUrl}/api/v1/shop/workflow-callback`,
          status: 1,
        },
        { transaction: t },
      )
    })

    logInfo('已种入商品发布审批流（shop-publish）')
  } catch (err) {
    // 种子失败不应阻断其它迁移：仅记录，工作流未就绪时 submitForPublish 会降级为直接发布。
    logInfo(`种入商品发布审批流失败（已跳过，不影响其余迁移）: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function down(): Promise<void> {
  try {
    const binding = await WorkflowBinding.findOne({ where: { bindingKey: 'shop-publish' } })
    if (!binding) return
    const wf = await Workflow.findByPk(binding.workflowId)
    await WorkflowBinding.destroy({ where: { bindingKey: 'shop-publish' } })
    if (wf) {
      await WorkflowNode.destroy({ where: { workflowId: wf.id } })
      await WorkflowEdge.destroy({ where: { workflowId: wf.id } })
      await WorkflowVersion.destroy({ where: { workflowId: wf.id } })
      await wf.destroy()
    }
  } catch (err) {
    logInfo(`回滚商品发布审批流失败: ${err instanceof Error ? err.message : String(err)}`)
  }
}
