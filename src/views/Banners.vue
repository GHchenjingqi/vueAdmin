<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">Banner 管理</h2>
      <p class="page-desc">配置首页营销 Banner 轮播。支持按时段控制展示、按排序权重排序、按位置区分 hero/secondary。</p>
    </div>

    <el-card shadow="never" class="mb-4">
      <div class="toolbar">
        <el-radio-group v-model="query.position" @change="load">
          <el-radio-button label="">全部</el-radio-button>
          <el-radio-button label="hero">首屏 Hero</el-radio-button>
          <el-radio-button label="secondary">次屏 Secondary</el-radio-button>
        </el-radio-group>
        <div class="spacer" />
        <el-button type="primary" @click="openCreate">新建 Banner</el-button>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="rows" border stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="预览" width="120">
          <template #default="{ row }">
            <el-image :src="row.image" :preview-src-list="[row.image]" fit="cover" style="width: 100px; height: 56px" />
          </template>
        </el-table-column>
        <el-table-column prop="title" label="主标题" min-width="160" show-overflow-tooltip />
        <el-table-column prop="subtitle" label="副标题" min-width="180" show-overflow-tooltip />
        <el-table-column label="位置" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.position === 'hero' ? 'primary' : 'info'" size="small">
              {{ row.position === 'hero' ? '首屏' : '次屏' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
              {{ row.enabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sortOrder" label="排序" width="80" align="center" />
        <el-table-column label="展示时段" width="200">
          <template #default="{ row }">
            <span v-if="!row.startAt && !row.endAt">永久</span>
            <span v-else>
              {{ row.startAt ? new Date(row.startAt).toLocaleDateString() : '—' }} ~
              {{ row.endAt ? new Date(row.endAt).toLocaleDateString() : '—' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row as BannerRow)">编辑</el-button>
            <el-button link type="danger" @click="remove(row as BannerRow)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新建/编辑 Banner -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑 Banner' : '新建 Banner'" width="640px">
      <el-form label-width="90px">
        <el-form-item label="位置">
          <el-select v-model="form.position" style="width: 100%">
            <el-option label="首屏 Hero（轮播主图）" value="hero" />
            <el-option label="次屏 Secondary（辅助推广）" value="secondary" />
          </el-select>
        </el-form-item>
        <el-form-item label="主标题" required>
          <el-input v-model="form.title" placeholder="如：夏季大促 全场 8 折" maxlength="255" />
        </el-form-item>
        <el-form-item label="副标题">
          <el-input v-model="form.subtitle" placeholder="如：精选 HD 蕾丝假发，限时优惠" maxlength="500" />
        </el-form-item>
        <el-form-item label="图片 URL" required>
          <el-input v-model="form.image" placeholder="https://cdn.example.com/banner.jpg" maxlength="512" />
        </el-form-item>
        <el-form-item label="跳转链接">
          <el-input v-model="form.linkUrl" placeholder="/c/lace-wigs 或 https://..." maxlength="512" />
        </el-form-item>
        <el-form-item label="按钮文案">
          <el-input v-model="form.buttonLabel" placeholder="如：立即抢购（留空不显示按钮）" maxlength="120" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" :max="99999" style="width: 100%" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="展示时段">
          <el-date-picker
            v-model="dateRange"
            type="datetimerange"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            style="width: 100%"
            value-format="YYYY-MM-DDTHH:mm:ssZ"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { shopBannerApi, type BannerRow } from '@/api'

defineOptions({ name: 'Banners' })

const loading = ref(false)
const saving = ref(false)
const rows = ref<BannerRow[]>([])
const query = reactive<{ position: '' | 'hero' | 'secondary' }>({ position: '' })

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const dateRange = ref<[string, string] | null>(null)
const form = reactive({
  position: 'hero' as 'hero' | 'secondary',
  title: '',
  subtitle: '',
  image: '',
  linkUrl: '',
  buttonLabel: '',
  sortOrder: 0,
  enabled: true,
})

const load = async () => {
  loading.value = true
  try {
    const params = query.position ? { position: query.position } : {}
    const res = await shopBannerApi.list(params)
    rows.value = res.data?.list ?? []
  } catch (err) {
    ElMessage.error('加载失败')
    console.error(err)
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  editingId.value = null
  Object.assign(form, { position: 'hero', title: '', subtitle: '', image: '', linkUrl: '', buttonLabel: '', sortOrder: 0, enabled: true })
  dateRange.value = null
  dialogVisible.value = true
}

const openEdit = (row: BannerRow) => {
  editingId.value = row.id
  Object.assign(form, {
    position: row.position,
    title: row.title,
    subtitle: row.subtitle ?? '',
    image: row.image,
    linkUrl: row.linkUrl ?? '',
    buttonLabel: row.buttonLabel ?? '',
    sortOrder: row.sortOrder,
    enabled: row.enabled,
  })
  dateRange.value = row.startAt && row.endAt ? [row.startAt, row.endAt] : null
  dialogVisible.value = true
}

const submit = async () => {
  if (!form.title.trim()) return ElMessage.warning('请填写主标题')
  if (!form.image.trim()) return ElMessage.warning('请填写图片 URL')

  saving.value = true
  try {
    const payload = {
      position: form.position,
      title: form.title,
      subtitle: form.subtitle || null,
      image: form.image,
      linkUrl: form.linkUrl || null,
      buttonLabel: form.buttonLabel || null,
      sortOrder: form.sortOrder,
      enabled: form.enabled,
      startAt: dateRange.value?.[0] ?? null,
      endAt: dateRange.value?.[1] ?? null,
    }

    if (editingId.value) {
      await shopBannerApi.update(editingId.value, payload)
      ElMessage.success('已更新')
    } else {
      await shopBannerApi.create(payload)
      ElMessage.success('已创建')
    }
    dialogVisible.value = false
    await load()
  } catch (err) {
    ElMessage.error('保存失败')
    console.error(err)
  } finally {
    saving.value = false
  }
}

const remove = async (row: BannerRow) => {
  try {
    await ElMessageBox.confirm(`确认删除 Banner「${row.title}」？`, '确认删除', { type: 'warning' })
    await shopBannerApi.remove(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error('删除失败')
      console.error(err)
    }
  }
}

onMounted(load)
</script>

<style scoped>
.page-container {
  padding: 20px;
}
.page-header {
  margin-bottom: 16px;
}
.page-title {
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 6px;
}
.page-desc {
  font-size: 14px;
  color: #909399;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
}
.spacer {
  flex: 1;
}
</style>
