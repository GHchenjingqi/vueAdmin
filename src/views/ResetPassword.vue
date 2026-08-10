<template>
  <div class="reset-pwd-page">
    <div class="reset-pwd-card">
      <div class="reset-pwd-header">
        <el-icon :size="40" color="#409eff">
          <Key />
        </el-icon>
        <h2>{{ t('resetPwd.title') }}</h2>
        <p>{{ t('resetPwd.subtitle') }}</p>
      </div>

      <!-- Token 无效 -->
      <el-result v-if="tokenStatus === 'invalid'" icon="error" :title="t('resetPwd.linkExpired')">
        <template #extra>
          <p style="color: var(--text-secondary); margin-bottom: 16px">
            {{ t('resetPwd.linkExpiredDesc') }}
          </p>
          <el-button type="primary" @click="router.push('/login')">
            {{ t('resetPwd.returnToLogin') }}
          </el-button>
        </template>
      </el-result>

      <!-- 重置成功 -->
      <el-result v-else-if="tokenStatus === 'success'" icon="success" :title="t('resetPwd.resetSuccess')">
        <template #extra>
          <p style="color: var(--text-secondary); margin-bottom: 16px">
            {{ t('resetPwd.resetSuccessDesc') }}
          </p>
          <el-button type="primary" @click="router.push('/login')">
            {{ t('resetPwd.goToLogin') }}
          </el-button>
        </template>
      </el-result>

      <!-- 重置表单 -->
      <el-form v-else ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="handleSubmit">
        <el-form-item :label="t('resetPwd.newPassword')" prop="newPassword">
          <el-input v-model="form.newPassword" type="password" :placeholder="t('resetPwd.inputNewPwd')" show-password />
        </el-form-item>
        <el-form-item :label="t('resetPwd.confirmPassword')" prop="confirmPassword">
          <el-input v-model="form.confirmPassword" type="password" :placeholder="t('resetPwd.inputConfirmPwd')" show-password />
        </el-form-item>

        <div class="password-hint">
          <p>{{ t('resetPwd.passwordRequirements') }}：</p>
          <ul>
            <li :class="{ valid: hasUpper }">
              {{ t('resetPwd.needUpper') }}
            </li>
            <li :class="{ valid: hasLower }">
              {{ t('resetPwd.needLower') }}
            </li>
            <li :class="{ valid: hasDigit }">
              {{ t('resetPwd.needDigit') }}
            </li>
            <li :class="{ valid: hasSpecial }">
              {{ t('resetPwd.needSpecial') }}
            </li>
            <li :class="{ valid: hasLength }">
              {{ t('resetPwd.pwdMinLength') }}
            </li>
          </ul>
        </div>

        <el-form-item>
          <el-button type="primary" :loading="loading" class="submit-btn" @click="handleSubmit">
            {{ t('resetPwd.confirmReset') }}
          </el-button>
          <el-button @click="router.push('/login')">
            {{ t('resetPwd.returnToLogin') }}
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { Key } from '@element-plus/icons-vue'
import { authApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const formRef = ref<FormInstance | null>(null)
const loading = ref(false)

const tokenStatus = ref<'valid' | 'invalid' | 'success'>('valid')

const form = reactive({
  newPassword: '',
  confirmPassword: '',
})

const rules = {
  newPassword: [
    { required: true, message: t('resetPwd.inputNewPwd'), trigger: 'blur' as const },
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        const errors = validatePasswordStrength(value)
        if (errors) return callback(new Error(errors))
        callback()
      },
      trigger: 'blur' as const,
    },
  ],
  confirmPassword: [
    { required: true, message: t('resetPwd.inputConfirmPwd'), trigger: 'blur' as const },
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (value !== form.newPassword) return callback(new Error(t('resetPwd.pwdMismatch')))
        callback()
      },
      trigger: 'blur' as const,
    },
  ],
}

const hasUpper = computed(() => /[A-Z]/.test(form.newPassword))
const hasLower = computed(() => /[a-z]/.test(form.newPassword))
const hasDigit = computed(() => /\d/.test(form.newPassword))
const hasSpecial = computed(() => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(form.newPassword))
const hasLength = computed(() => form.newPassword.length >= 8)

function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return t('resetPwd.pwdMinLength')
  if (!/[A-Z]/.test(password)) return t('resetPwd.needUpper')
  if (!/[a-z]/.test(password)) return t('resetPwd.needLower')
  if (!/\d/.test(password)) return t('resetPwd.needDigit')
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return t('resetPwd.needSpecial')
  return null
}

const handleSubmit = async (): Promise<void> => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  const token = route.query.token as string | undefined
  if (!token) {
    tokenStatus.value = 'invalid'
    return
  }

  loading.value = true
  try {
    await authApi.resetPassword(token, form.newPassword)
    tokenStatus.value = 'success'
    ElMessage.success(t('resetPwd.resetSuccessMsg'))
  } catch (err: unknown) {
    const msg = getErrorMessage(err)
    if (msg.includes('失效')) {
      tokenStatus.value = 'invalid'
    } else {
      ElMessage.error(msg || t('resetPwd.resetFailed'))
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  const token = route.query.token as string | undefined
  if (!token) {
    tokenStatus.value = 'invalid'
  }
})
</script>

<style lang="scss" scoped>
.reset-pwd-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: var(--content-bg, #f5f6fa);
}

.reset-pwd-card {
  width: 440px;
  padding: 40px;
  background: var(--card-bg, #fff);
  border-radius: 8px;
  box-shadow: var(--shadow-lg, 0 2px 12px rgba(0, 0, 0, 0.08));
}

.reset-pwd-header {
  text-align: center;
  margin-bottom: 32px;
}

.reset-pwd-header h2 {
  margin: 12px 0 4px;
  font-size: 22px;
  color: var(--text-primary, #303133);
}

.reset-pwd-header p {
  color: var(--text-secondary, #909399);
  font-size: 14px;
}

.password-hint {
  margin: -8px 0 16px;
  padding: 12px 16px;
  background: var(--hover-bg, #f5f7fa);
  border-radius: 6px;
  font-size: 13px;
}

.password-hint p {
  margin: 0 0 6px;
  color: var(--text-secondary, #909399);
  font-weight: 500;
}

.password-hint ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.password-hint li {
  position: relative;
  padding-left: 18px;
  line-height: 1.8;
  color: var(--text-secondary, #909399);
  font-size: 12px;
}

.password-hint li::before {
  content: '?';
  position: absolute;
  left: 0;
  color: #f56c6c;
}

.password-hint li.valid::before {
  content: '?';
  color: #67c23a;
}

.password-hint li.valid {
  color: #67c23a;
}

.submit-btn {
  width: 100%;
}
</style>
