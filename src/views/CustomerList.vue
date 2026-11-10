<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">会员管理</h2>
      <p class="page-desc">C 端顾客会员体系（等级 / 积分 / 成长值）。与「用户管理」（后台管理员账号）是两套体系。</p>
    </div>

    <el-card shadow="never">
      <!-- 工具栏 -->
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="搜索邮箱 / 昵称" clearable style="width: 240px" @keyup.enter="load" @clear="load" />
        <el-select v-model="query.status" placeholder="状态" clearable style="width: 120px" @change="load">
          <el-option label="正常" value="active" />
          <el-option label="已禁用" value="blocked" />
        </el-select>
        <el-button type="primary" @click="load">查询</el-button>
      </div>

      <!-- 列表 -->
      <el-table v-loading="loading" :data="rows" border stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="email" label="邮箱" min-width="200" show-overflow-tooltip />
        <el-table-column prop="nickname" label="昵称" min-width="120" show-overflow-tooltip />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
              {{ row.status === 'active' ? '正常' : '已禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="points" label="积分" width="90" align="right" />
        <el-table-column label="消费金额(元)" width="110" align="right">
          <template #default="{ row }">{{ row.growthValue }}</template>
        </el-table-column>
        <el-table-column prop="orderCount" label="消费次数" width="90" align="right" />
        <el-table-column prop="loginCount" label="登录次数" width="90" align="right" />
        <el-table-column label="最近登录" width="160">
          <template #default="{ row }">{{ row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : '—' }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="注册时间" width="170">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row as ShopCustomerRow)">详情</el-button>
            <el-button link type="primary" @click="openAdjust(row as ShopCustomerRow)">调积分</el-button>
            <el-button link :type="row.status === 'active' ? 'danger' : 'success'" @click="toggleStatus(row as ShopCustomerRow)">
              {{ row.status === 'active' ? '禁用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        :total="total"
        layout="total, prev, pager, next, sizes"
        class="mt-4"
        @current-change="load"
        @size-change="load"
      />
    </el-card>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" title="顾客详情" size="480px">
      <template v-if="detail">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="邮箱">{{ detail.customer.email }}</el-descriptions-item>
          <el-descriptions-item label="昵称">{{ detail.customer.nickname ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="当前等级">{{ detail.membership.tier?.name ?? '暂无' }}</el-descriptions-item>
          <el-descriptions-item label="可用积分">{{ detail.membership.points }}</el-descriptions-item>
          <el-descriptions-item label="消费金额(元)">{{ detail.membership.growthValue }}</el-descriptions-item>
          <el-descriptions-item label="消费次数">{{ detail.membership.stats.orderCount }}</el-descriptions-item>
          <el-descriptions-item label="登录次数">{{ detail.membership.stats.loginCount }}</el-descriptions-item>
          <el-descriptions-item label="最近登录">
            {{ detail.membership.stats.lastLoginAt ? new Date(detail.membership.stats.lastLoginAt).toLocaleString() : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="下一等级">
            <template v-if="detail.membership.nextTier">{{ detail.membership.nextTier.name }}（还差 {{ detail.membership.nextTier.remaining }}）</template>
            <template v-else>已是最高等级</template>
          </el-descriptions-item>
        </el-descriptions>

        <h4 class="mt-4 mb-2">积分流水</h4>
        <el-table :data="detail.pointsLogs.list" size="small" border>
          <el-table-column prop="createdAt" label="时间" width="150">
            <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column prop="reason" label="类型" width="110">
            <template #default="{ row }">{{ row.reason === 'order_captured' ? '订单奖励' : row.reason === 'manual' ? '人工调整' : row.reason }}</template>
          </el-table-column>
          <el-table-column prop="change" label="变动" width="80" align="right">
            <template #default="{ row }">
              <span :class="row.change > 0 ? 'text-green-600' : 'text-red-500'">{{ row.change > 0 ? '+' : '' }}{{ row.change }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="balanceAfter" label="余额" width="80" align="right" />
        </el-table>
      </template>
    </el-drawer>

    <!-- 调积分对话框 -->
    <el-dialog v-model="adjustVisible" title="调整积分" width="420px">
      <el-form label-width="80px">
        <el-form-item label="顾客">{{ adjustTarget?.email }}</el-form-item>
        <el-form-item label="变动">
          <el-input-number v-model="adjustChange" :step="10" :precision="0" />
          <span class="ml-2 text-xs text-gray-500">正=发放，负=扣减</span>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="adjustNote" placeholder="选填，记入流水" maxlength="255" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustVisible = false">取消</el-button>
        <el-button type="primary" :loading="adjustBusy" @click="submitAdjust">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { shopCustomerApi, type ShopCustomerRow, type PointsLogRow, type CustomerMembershipView } from '@/api'

/**
 * 会员管理（C 端顾客体系）：列表 / 详情+流水 / 调积分 / 启停。
 * 注意区分：后台「用户管理」（/users）管理的是 B 端管理员账号，与本页无关。
 */
defineOptions({ name: 'CustomerList' })

const loading = ref(false)
const rows = ref<ShopCustomerRow[]>([])
const total = ref(0)
const query = reactive({ page: 1, pageSize: 20, keyword: '', status: '' })

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await shopCustomerApi.list({ ...query })
    rows.value = res.data.rows
    total.value = res.data.total
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载失败')
  } finally {
    loading.value = false
  }
}

// 详情
const detailVisible = ref(false)
const detail = ref<{ customer: ShopCustomerRow; membership: CustomerMembershipView; pointsLogs: { list: PointsLogRow[]; total: number } } | null>(null)
async function openDetail(row: ShopCustomerRow): Promise<void> {
  try {
    const res = await shopCustomerApi.getById(row.id)
    detail.value = res.data
    detailVisible.value = true
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载详情失败')
  }
}

// 调积分
const adjustVisible = ref(false)
const adjustBusy = ref(false)
const adjustTarget = ref<ShopCustomerRow | null>(null)
const adjustChange = ref(0)
const adjustNote = ref('')
function openAdjust(row: ShopCustomerRow): void {
  adjustTarget.value = row
  adjustChange.value = 0
  adjustNote.value = ''
  adjustVisible.value = true
}
async function submitAdjust(): Promise<void> {
  if (!adjustTarget.value || !adjustChange.value) {
    ElMessage.warning('变动值不能为 0')
    return
  }
  adjustBusy.value = true
  try {
    await shopCustomerApi.adjustPoints(adjustTarget.value.id, adjustChange.value, adjustNote.value || undefined)
    ElMessage.success('积分已调整')
    adjustVisible.value = false
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '调整失败')
  } finally {
    adjustBusy.value = false
  }
}

// 启停
async function toggleStatus(row: ShopCustomerRow): Promise<void> {
  const next = row.status === 'active' ? 'blocked' : 'active'
  const tip = next === 'blocked' ? '禁用后该顾客将无法登录前台，确认？' : '确认恢复该顾客登录？'
  try {
    await ElMessageBox.confirm(tip, '提示', { type: 'warning' })
  } catch {
    return
  }
  try {
    await shopCustomerApi.updateStatus(row.id, next)
    ElMessage.success(next === 'blocked' ? '已禁用' : '已启用')
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '操作失败')
  }
}

onMounted(load)
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.page-desc {
  color: #909399;
  font-size: 13px;
  margin-top: 4px;
}
</style>
