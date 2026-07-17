<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? t('user.editUser') : t('user.addUser')"
    width="500px"
    :close-on-click-modal="false"
    destroy-on-close
    @closed="handleClosed"
  >
    <ProForm ref="proFormRef" v-model="form" :schema="formSchema" :columns="1" :show-actions="false" label-width="80px" />

    <template #footer>
      <el-button @click="visible = false">
        {{ t('common.cancel') }}
      </el-button>
      <el-button type="primary" :loading="submitLoading" @click="handleSubmit">
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { userApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import ProForm from '@/components/ProForm/index.vue'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    isEdit?: boolean
    row?: Record<string, unknown> | null
  }>(),
  {
    isEdit: false,
    row: null,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'success'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const proFormRef = ref<InstanceType<typeof ProForm> | null>(null)
const submitLoading = ref(false)

const form = ref({
  username: '',
  nickname: '',
  email: '',
  phone: '',
  status: 1,
  deptId: null as number | null,
  roleIds: [] as number[],
})

const formSchema = computed(() => [
  { prop: 'username', label: t('user.username'), type: 'input', placeholder: t('user.inputUsername'), required: true },
  { prop: 'nickname', label: t('user.nickname'), type: 'input', placeholder: t('user.inputNickname') },
  {
    prop: 'email',
    label: t('common.email'),
    type: 'input',
    placeholder: t('user.inputEmail'),
    required: true,
    rules: [{ type: 'email', message: t('user.emailFormatError'), trigger: 'blur' }],
  },
  { prop: 'phone', label: t('common.phone'), type: 'input', placeholder: t('user.inputPhone') },
  {
    prop: 'deptId',
    label: t('user.deptLabel'),
    type: 'select',
    placeholder: t('user.selectDept'),
    clearable: true,
    options: [] as { label: string; value: number }[],
  },
  {
    prop: 'roleIds',
    label: t('user.role'),
    type: 'select',
    placeholder: t('user.selectRole'),
    multiple: true,
    clearable: true,
    options: [] as { label: string; value: number }[],
  },
  {
    prop: 'status',
    label: t('common.status'),
    type: 'switch',
    props: { activeText: t('user.enabled'), inactiveText: t('user.disabled') },
    activeValue: 1,
    inactiveValue: 0,
  },
])

/** 设置部门选项 */
function setDeptOptions(options: { label: string; value: number }[]): void {
  const schema = formSchema.value.find((s) => s.prop === 'deptId')
  if (schema) {
    schema.options = options
  }
}

/** 设置角色选项 */
function setRoleOptions(options: { label: string; value: number }[]): void {
  const schema = formSchema.value.find((s) => s.prop === 'roleIds')
  if (schema) {
    schema.options = options
  }
}

defineExpose({ setDeptOptions, setRoleOptions })

// 监听编辑行数据变化，填充表单
watch(
  () => props.row,
  (row) => {
    if (row) {
      const userRow = row as Record<string, unknown>
      form.value = {
        username: (userRow.username as string) || '',
        nickname: (userRow.nickname as string) || '',
        email: (userRow.email as string) || '',
        phone: (userRow.phone as string) || '',
        status: (userRow.status as number) ?? 1,
        deptId: (userRow.deptId as number) ?? null,
        roleIds: Array.isArray(userRow.roles) ? (userRow.roles as { id: number }[]).map((r) => r.id) : [],
      }
    }
  },
  { immediate: true },
)

function handleClosed(): void {
  if (!props.isEdit) {
    form.value = {
      username: '',
      nickname: '',
      email: '',
      phone: '',
      status: 1,
      deptId: null,
      roleIds: [],
    }
  }
}

async function handleSubmit(): Promise<void> {
  const valid = await proFormRef.value?.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    const payload = { ...form.value }
    if (props.isEdit && props.row?.id) {
      const rowId = props.row.id as number
      await userApi.update(rowId, payload)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await userApi.create(payload)
      ElMessage.success(t('common.createSuccess'))
    }
    visible.value = false
    emit('success')
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err) || t('common.operationFailed'))
  } finally {
    submitLoading.value = false
  }
}
</script>
