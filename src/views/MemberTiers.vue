<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">会员等级配置</h2>
      <p class="page-desc">
        三维度分级门槛后台自定义：消费金额（元）/ 登录频率（次数）/ 消费次数。 策略 any=任一维度达标即升级；all=全部达标。0 门槛=该维度不设限。
      </p>
    </div>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button type="primary" @click="openCreate">新增等级</el-button>
        <el-button :loading="recalcBusy" @click="recalculate">重算全体顾客等级</el-button>
        <el-checkbox v-model="allowDemote">允许降级（严格执行新门槛）</el-checkbox>
        <span class="hint">修改门槛后立即生效（下一次登录/下单/达标判定时按新门槛升级）</span>
      </div>

      <el-alert type="info" :closable="false" class="mb-4">
        <div class="expiry-row">
          <span>积分有效期：</span>
          <el-input-number v-model="expiryDays" :min="0" :max="3650" :precision="0" size="small" style="width: 120px" />
          <span>天</span>
          <el-button size="small" type="primary" :loading="expiryBusy" @click="saveExpiry">保存</el-button>
          <el-button size="small" :loading="expireBusy" @click="expireNow">手动触发过期作废</el-button>
          <span class="hint">0 = 不过期；到期自动作废（每 5 分钟自动扫描 + 可手动触发）。仅作废未消耗批次（FIFO 记账）。</span>
        </div>
      </el-alert>

      <el-table v-loading="loading" :data="rows" border stripe>
        <el-table-column prop="level" label="序号" width="70" align="center" />
        <el-table-column prop="name" label="等级名称" min-width="120" />
        <el-table-column label="消费金额门槛(元)" width="150" align="right">
          <template #default="{ row }">{{ row.growthThreshold }}</template>
        </el-table-column>
        <el-table-column label="登录频率门槛(次)" width="150" align="right">
          <template #default="{ row }">{{ row.loginFrequency }}</template>
        </el-table-column>
        <el-table-column label="消费次数门槛" width="130" align="right">
          <template #default="{ row }">{{ row.orderCountThreshold }}</template>
        </el-table-column>
        <el-table-column label="折扣(%)" width="90" align="right">
          <template #default="{ row }">{{ row.discountPct || '—' }}</template>
        </el-table-column>
        <el-table-column label="策略" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.matchStrategy === 'all' ? 'warning' : 'info'">{{ row.matchStrategy }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row as TierRow)">编辑</el-button>
            <el-button link type="danger" @click="remove(row as TierRow)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑 -->
    <el-dialog v-model="editVisible" :title="editId ? '编辑等级' : '新增等级'" width="480px">
      <el-form label-width="130px">
        <el-form-item label="等级序号">
          <el-input-number v-model="form.level" :min="1" :precision="0" :disabled="!!editId" />
        </el-form-item>
        <el-form-item label="等级名称">
          <el-input v-model="form.name" maxlength="64" />
        </el-form-item>
        <el-form-item label="消费金额门槛(元)">
          <el-input-number v-model="form.growthThreshold" :min="0" :precision="0" :step="500" />
        </el-form-item>
        <el-form-item label="登录频率门槛(次)">
          <el-input-number v-model="form.loginFrequency" :min="0" :precision="0" :step="5" />
        </el-form-item>
        <el-form-item label="消费次数门槛">
          <el-input-number v-model="form.orderCountThreshold" :min="0" :precision="0" :step="1" />
        </el-form-item>
        <el-form-item label="折扣(%)">
          <el-input-number v-model="form.discountPct" :min="0" :max="100" :precision="0" />
          <span class="hint ml-2">95 = 95折，0 = 无折扣</span>
        </el-form-item>
        <el-form-item label="达标策略">
          <el-radio-group v-model="form.matchStrategy">
            <el-radio value="any">any（任一维度）</el-radio>
            <el-radio value="all">all（全部维度）</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="busy" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { membershipTierApi } from '@/api'

/**
 * 会员等级配置（后台自定义三维度门槛）：
 * 等级种子仅初始默认，实际门槛以本页配置为准；
 * 判定逻辑见 membershipService.meetsTier（any/all 策略，0 门槛=不设限）。
 */
defineOptions({ name: 'MemberTiers' })

interface TierRow {
  id: number
  name: string
  level: number
  growthThreshold: number
  loginFrequency: number
  orderCountThreshold: number
  discountPct: number
  matchStrategy: string
}

const loading = ref(false)
const rows = ref<TierRow[]>([])

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await membershipTierApi.list()
    rows.value = res.data
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载失败')
  } finally {
    loading.value = false
  }
}

const editVisible = ref(false)
const busy = ref(false)
const editId = ref<number | null>(null)
const form = reactive({
  level: 1,
  name: '',
  growthThreshold: 0,
  loginFrequency: 0,
  orderCountThreshold: 0,
  discountPct: 0,
  matchStrategy: 'any',
})

function openCreate(): void {
  editId.value = null
  Object.assign(form, {
    level: (rows.value[rows.value.length - 1]?.level ?? 0) + 1,
    name: '',
    growthThreshold: 0,
    loginFrequency: 0,
    orderCountThreshold: 0,
    discountPct: 0,
    matchStrategy: 'any',
  })
  editVisible.value = true
}

function openEdit(row: TierRow): void {
  editId.value = row.id
  Object.assign(form, {
    level: row.level,
    name: row.name,
    growthThreshold: row.growthThreshold,
    loginFrequency: row.loginFrequency,
    orderCountThreshold: row.orderCountThreshold,
    discountPct: row.discountPct,
    matchStrategy: row.matchStrategy,
  })
  editVisible.value = true
}

async function submit(): Promise<void> {
  if (!form.name.trim()) {
    ElMessage.warning('等级名称不能为空')
    return
  }
  busy.value = true
  try {
    if (editId.value) {
      await membershipTierApi.update(editId.value, { ...form })
      ElMessage.success('已保存')
    } else {
      await membershipTierApi.create({ ...form })
      ElMessage.success('已新增')
    }
    editVisible.value = false
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    busy.value = false
  }
}

async function remove(row: TierRow): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认删除等级「${row.name}」？有顾客挂在该等级时将无法删除。`, '提示', { type: 'warning' })
  } catch {
    return
  }
  try {
    await membershipTierApi.remove(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '删除失败')
  }
}

// 批量重算：门槛变更后按新规则重算全体顾客等级；allowDemote 开启时严格执行新门槛（含降级）
const recalcBusy = ref(false)
const allowDemote = ref(false)
async function recalculate(): Promise<void> {
  const mode = allowDemote.value ? '严格执行新门槛（含降级）' : '只升不降（门槛提高不会降级）'
  try {
    await ElMessageBox.confirm(`按当前门槛重算全体顾客等级？策略：${mode}。顾客量大时可能耗时数十秒。`, '批量重算', { type: 'warning' })
  } catch {
    return
  }
  recalcBusy.value = true
  try {
    const res = await membershipTierApi.recalculate(allowDemote.value)
    ElMessage.success(`重算完成：扫描 ${res.data.scanned} 人，升级 ${res.data.upgraded} 人，降级 ${res.data.demoted} 人`)
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '重算失败')
  } finally {
    recalcBusy.value = false
  }
}

// 积分有效期（天；0=不过期）：读取 / 保存 / 手动触发过期作废
const expiryDays = ref(0)
const expiryBusy = ref(false)
const expireBusy = ref(false)

async function loadExpiry(): Promise<void> {
  try {
    const res = await membershipTierApi.getExpiry()
    expiryDays.value = res.data.days
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载积分有效期失败')
  }
}

async function saveExpiry(): Promise<void> {
  expiryBusy.value = true
  try {
    await membershipTierApi.setExpiry(expiryDays.value)
    ElMessage.success('积分有效期已保存')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    expiryBusy.value = false
  }
}

async function expireNow(): Promise<void> {
  expireBusy.value = true
  try {
    const res = await membershipTierApi.expireNow()
    ElMessage.success(`已作废 ${res.data.expiredPoints} 积分（涉及 ${res.data.expiredCustomers} 名顾客）`)
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '操作失败')
  } finally {
    expireBusy.value = false
  }
}

onMounted(() => {
  load()
  loadExpiry()
})
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.hint {
  color: #909399;
  font-size: 12px;
}
.page-desc {
  color: #909399;
  font-size: 13px;
  margin-top: 4px;
}
</style>
