<template>
  <div class="force-pwd-page">
    <div class="force-pwd-card">
      <div class="force-pwd-header">
        <el-icon :size="40" color="#e6a23c">
          <WarningFilled />
        </el-icon>
        <h2>{{ t('forcePwd.title') }}</h2>
        <p>{{ t('forcePwd.subtitle') }}</p>
      </div>
      <el-form ref="formRef" :model="form" :rules="rules" size="large" label-width="80px" @keyup.enter="handleSubmit">
        <el-form-item :label="t('forcePwd.newPassword')" prop="newPassword">
          <el-input v-model="form.newPassword" type="password" :placeholder="t('forcePwd.inputNewPwd')" show-password />
        </el-form-item>
        <el-form-item :label="t('forcePwd.confirmPassword')" prop="confirmPassword">
          <el-input v-model="form.confirmPassword" type="password" :placeholder="t('forcePwd.inputConfirmPwd')" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" class="submit-btn" @click="handleSubmit">
            {{ t('forcePwd.confirmChange') }}
          </el-button>
          <el-button @click="handleLogout">
            {{ t('forcePwd.relogin') }}
          </el-button>
        </el-form-item>
      </el-form>
      <div class="password-hint">
        <p>{{ t('forcePwd.passwordRequirements') }}</p>
        <ul>
          <li :class="{ valid: strength.hasUpper }">
            {{ t('forcePwd.hasUpper') }}
          </li>
          <li :class="{ valid: strength.hasLower }">
            {{ t('forcePwd.hasLower') }}
          </li>
          <li :class="{ valid: strength.hasDigit }">
            {{ t('forcePwd.hasDigit') }}
          </li>
          <li :class="{ valid: strength.hasSpecial }">
            {{ t('forcePwd.hasSpecial') }}
          </li>
          <li :class="{ valid: strength.hasLength }">
            {{ t('forcePwd.hasLength') }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { WarningFilled } from '@element-plus/icons-vue'
import { authApi } from '@/api'
import { useUserStore } from '@/stores'
import { checkPasswordStrength, createConfirmValidator } from '@/utils/validators'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const router = useRouter()
const userStore = useUserStore()
const { t } = useI18n()
const formRef = ref<InstanceType<(typeof import('element-plus'))['ElForm']> | null>(null)
const loading = ref(false)

let form = reactive({
  newPassword: '',
  confirmPassword: '',
})

const strength = computed(() => checkPasswordStrength(form.newPassword))

const rules = {
  newPassword: [
    { required: true, message: t('forcePwd.inputNewPwdRequired'), trigger: 'blur' },
    { min: 8, message: t('forcePwd.pwdMinLength'), trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: t('forcePwd.inputConfirmPwdRequired'), trigger: 'blur' },
    { validator: createConfirmValidator(() => form.newPassword), trigger: 'blur' },
  ],
}

const handleSubmit = async () => {
  const formEl = formRef.value
  if (!formEl) return
  const valid = await formEl.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await authApi.changePassword({ newPassword: form.newPassword })
    ElMessage.success(t('forcePwd.changeSuccess'))
    userStore.setPasswordResetRequired(false)
    router.push('/')
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err) || t('forcePwd.changeFailed'))
  } finally {
    loading.value = false
  }
}

const handleLogout = async () => {
  try {
    await authApi.logout()
  } catch {
    // 退出接口调用失败，仍继续清理本地状态并跳转
  }
  userStore.logout()
  router.push('/login')
}
</script>

<style lang="scss" scoped>
.force-pwd-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--content-bg);
}

.force-pwd-card {
  width: 440px;
  padding: 40px;
  background: var(--card-bg);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}

.force-pwd-header {
  text-align: center;
  margin-bottom: 32px;
}

.force-pwd-header h2 {
  margin: 16px 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.force-pwd-header p {
  font-size: 13px;
  color: var(--text-secondary);
}

.submit-btn {
  width: 100%;
}

.password-hint {
  margin-top: 24px;
  padding: 16px;
  background: var(--tag-bg, #f5f7fa);
  border-radius: 8px;
}

.password-hint p {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.password-hint ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.password-hint li {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 2px 0;
  position: relative;
  padding-left: 16px;
}

.password-hint li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e0e0e0;
}

.password-hint li.valid {
  color: #52c41a;
}

.password-hint li.valid::before {
  background: #52c41a;
}
</style>
