<template>
  <div class="page-container apply-page">
    <el-row :gutter="16">
      <!-- 左：选择已发布工作流 -->
      <el-col :span="8">
        <el-card shadow="never" class="wf-list-card">
          <template #header>
            <span class="card-title">{{ t('workflow.applySelectWorkflow') }}</span>
          </template>
          <el-empty v-if="loadingWorkflows" description="加载中..." />
          <el-empty v-else-if="workflows.length === 0" :description="t('workflow.applyNoWorkflow')" />
          <ul v-else class="wf-list">
            <li v-for="wf in workflows" :key="wf.id" class="wf-item" :class="{ active: selected?.id === wf.id }" @click="selectWorkflow(wf)">
              <div class="wf-item-name">
                {{ wf.name }}
              </div>
              <div class="wf-item-desc">
                {{ wf.description || '-' }}
              </div>
              <el-tag size="small" type="success">V{{ wf.publishedVersionId }}</el-tag>
            </li>
          </ul>
        </el-card>
      </el-col>

      <!-- 右：动态表单 + 提交 -->
      <el-col :span="16">
        <el-card v-loading="submitting" shadow="never">
          <template #header>
            <span class="card-title">{{ t('workflow.applyFillForm') }}</span>
          </template>

          <el-empty v-if="!selected" :description="t('workflow.applyPleaseSelect')" />

          <template v-else>
            <el-alert :title="`${selected.name} · ${t('workflow.applyFillTip')}`" type="info" :closable="false" show-icon style="margin-bottom: 16px" />

            <el-form v-if="fields.length > 0" ref="formRef" :model="formData" :rules="formRules" label-width="110px">
              <el-form-item v-for="f in fields" :key="f.fieldKey" :label="f.label" :prop="f.fieldKey">
                <el-input v-if="f.type === 'text'" v-model="formModel[f.fieldKey]" :placeholder="f.placeholder || ''" />
                <el-input v-else-if="f.type === 'textarea'" v-model="formModel[f.fieldKey]" type="textarea" :rows="3" :placeholder="f.placeholder || ''" />
                <el-input v-else-if="f.type === 'number'" v-model.number="formModel[f.fieldKey]" type="number" :placeholder="f.placeholder || ''" />
                <el-select
                  v-else-if="f.type === 'select'"
                  v-model="formModel[f.fieldKey]"
                  style="width: 100%"
                  :placeholder="f.placeholder || t('workflow.applySelectPlaceholder')"
                >
                  <el-option v-for="opt in parseOptions(f.options)" :key="opt" :label="opt" :value="opt" />
                </el-select>
                <el-date-picker
                  v-else-if="f.type === 'date'"
                  v-model="formModel[f.fieldKey]"
                  type="date"
                  value-format="YYYY-MM-DD"
                  style="width: 100%"
                  :placeholder="f.placeholder || ''"
                />
                <div v-else-if="f.type === 'file'">
                  <el-upload
                    :auto-upload="true"
                    :show-file-list="true"
                    :file-list="fileLists[f.fieldKey] || []"
                    :http-request="(opt: any) => customUpload(opt, f)"
                  >
                    <el-button type="primary" :icon="Upload">
                      {{ t('workflow.applyUpload') }}
                    </el-button>
                  </el-upload>
                  <div v-if="formModel[f.fieldKey]" class="file-link">
                    <el-link type="primary" :href="String(formModel[f.fieldKey])" target="_blank">
                      {{ t('workflow.applyUpload') }}: {{ String(formModel[f.fieldKey]) }}
                    </el-link>
                  </div>
                </div>
              </el-form-item>
            </el-form>
            <el-empty v-else :description="t('workflow.applyNoFields')" />

            <el-form label-width="110px" style="margin-top: 8px">
              <el-form-item :label="t('workflow.applyTitle')">
                <el-input v-model="launchTitle" :placeholder="t('workflow.applyTitlePlaceholder')" />
              </el-form-item>
            </el-form>

            <div class="apply-footer">
              <el-button type="primary" :loading="submitting" :disabled="fields.length === 0" @click="handleSubmit">
                {{ t('workflow.applySubmit') }}
              </el-button>
            </div>
          </template>
        </el-card>

        <el-card v-if="result" shadow="never" class="result-card">
          <el-result icon="success" :title="t('workflow.applySuccessTitle')" :sub-title="t('workflow.applySuccessSub', { id: result.instanceId })">
            <template #extra>
              <el-button type="primary" @click="goInstances">
                {{ t('workflow.applyViewInstances') }}
              </el-button>
              <el-button @click="goApproval">
                {{ t('workflow.applyGoApproval') }}
              </el-button>
            </template>
          </el-result>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import { workflowApi, type Workflow, type WorkflowFormField } from '@/api/workflow'
import { uploadApi } from '@/api/upload'
import { useI18n } from '@/i18n'

const { t } = useI18n()
const router = useRouter()

const workflows = ref<Workflow[]>([])
const loadingWorkflows = ref(false)
const selected = ref<Workflow | null>(null)
const fields = ref<WorkflowFormField[]>([])
const formData = reactive<Record<string, unknown>>({})
// 表单值类型视图：动态字段的 v-model 需要 string|number 值域（el 组件 prop 类型约束）。
// 仅收窄类型、引用不变，对 formData 的读写仍走原 reactive 对象，响应性保留。
const formModel = formData as Record<string, string | number | undefined>
const launchTitle = ref('')
const submitting = ref(false)
const formRef = ref<InstanceType<typeof import('element-plus').ElForm> | null>(null)
const result = ref<{ instanceId: number } | null>(null)
// 附件字段的已上传文件列表（按 fieldKey 存放），用于 el-upload 展示
const fileLists = reactive<Record<string, { name: string; url: string }[]>>({})

const formRules = computed(() => {
  const rules: Record<string, unknown[]> = {}
  for (const f of fields.value) {
    if (f.required) {
      rules[f.fieldKey] = [{ required: true, message: t('workflow.applyFieldRequired', { label: f.label }), trigger: 'blur' }]
    }
  }
  return rules
})

async function fetchWorkflows() {
  loadingWorkflows.value = true
  try {
    const res = await workflowApi.list({ status: 1, page: 1, pageSize: 200 })
    workflows.value = (res.data?.rows || []).filter((w) => w.publishedVersionId)
  } catch {
    workflows.value = []
  } finally {
    loadingWorkflows.value = false
  }
}

async function selectWorkflow(wf: Workflow) {
  selected.value = wf
  result.value = null
  launchTitle.value = ''
  Object.keys(formData).forEach((k) => delete formData[k])
  Object.keys(fileLists).forEach((k) => delete fileLists[k])
  const res = await workflowApi.getFormFields(wf.id)
  fields.value = res.data || []
  // 初始化默认值
  for (const f of fields.value) {
    if (f.type === 'number') formData[f.fieldKey] = null
    else if (f.type === 'file') {
      formData[f.fieldKey] = ''
      fileLists[f.fieldKey] = []
    } else formData[f.fieldKey] = ''
  }
}

/** 自定义上传：调用 /upload 接口，成功后把返回 url 写入表单模型 */
async function customUpload(options: { file: File; onSuccess: (d: unknown) => void; onError: (e: unknown) => void }, f: WorkflowFormField): Promise<void> {
  try {
    const res = await uploadApi.upload(options.file, 'workflow')
    const url = (res.data as { url: string }).url
    formData[f.fieldKey] = url
    fileLists[f.fieldKey] = [{ name: options.file.name, url }]
    options.onSuccess(res.data)
    ElMessage.success(t('workflow.applyUpload') + t('common.success'))
  } catch {
    options.onError(new Error('upload failed'))
    ElMessage.error(t('workflow.operationFailed'))
  }
}

function parseOptions(options?: string | null): string[] {
  if (!options) return []
  return options
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function handleSubmit() {
  if (!selected.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const wf = selected.value
    const bindingKey = `wf-${wf.id}`
    // 确保绑定存在（重复创建会被唯一约束拦截，忽略即可）
    await workflowApi.createBinding({ workflowId: wf.id, bindingKey, entityName: 'manual', formKey: `wf-${wf.id}` }).catch(() => {})

    const res = await workflowApi.trigger({
      bindingKey,
      bindingId: Date.now(),
      input: { ...formData },
      title: launchTitle.value || `${wf.name} 申请`,
    })
    const instanceId = (res.data as unknown as { id?: number })?.id
    result.value = { instanceId: instanceId || 0 }
    ElMessage.success(t('workflow.applySuccessTitle'))
  } catch {
    ElMessage.error(t('workflow.operationFailed'))
  } finally {
    submitting.value = false
  }
}

function goInstances() {
  router.push('/workflow-instances')
}
function goApproval() {
  router.push('/approval-center')
}

onMounted(fetchWorkflows)
</script>

<style lang="scss" scoped>
.apply-page {
  .wf-list-card,
  .result-card {
    margin-bottom: 16px;
  }
  .card-title {
    font-weight: 600;
  }
  .wf-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 60vh;
    overflow-y: auto;
    .wf-item {
      padding: 10px 12px;
      border: 1px solid var(--el-border-color-light);
      border-radius: 6px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.2s;
      &:hover {
        border-color: var(--el-color-primary);
      }
      &.active {
        border-color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
      }
      .wf-item-name {
        font-weight: 600;
        margin-bottom: 4px;
      }
      .wf-item-desc {
        font-size: 12px;
        color: var(--el-text-color-secondary);
        margin-bottom: 6px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  }
  .apply-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
  }
  .file-link {
    margin-top: 6px;
    font-size: 12px;
    word-break: break-all;
  }
}
</style>
