/**
 * 工作流实例结束回调：实例审批通过/驳回后，若绑定配置了 callbackUrl，
 * 向业务系统 POST 结果，用于业务状态同步（如把「请假单」置为已通过）。
 * 失败不影响流程本身。
 */
import WorkflowBinding from '../models/WorkflowBinding.js'
import { logInfo } from '../utils/fileLogger.js'
import { errMessage } from '../utils/errMessage.js'

export async function fireWorkflowCallback(
  instance: { bindingKey: string | null; bindingId: number | null; id: number; title: string | null; status: string; output?: string | null },
  finalStatus: 'approved' | 'rejected',
): Promise<void> {
  if (!instance.bindingKey) return
  const binding = await WorkflowBinding.findOne({ where: { bindingKey: instance.bindingKey } }).catch(() => null)
  if (!binding || !binding.callbackUrl) return

  const payload = {
    instanceId: instance.id,
    bindingKey: instance.bindingKey,
    bindingId: instance.bindingId,
    status: finalStatus,
    title: instance.title,
    output: instance.output ? safeParse(instance.output) : null,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(binding.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    logInfo(`工作流回调 [${instance.id}] -> ${binding.callbackUrl} 状态码 ${res.status}`)
  } catch (err: unknown) {
    logInfo(`工作流回调 [${instance.id}] 失败: ${errMessage(err)}`)
  } finally {
    clearTimeout(timer)
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}
