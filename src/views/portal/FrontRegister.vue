<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1>{{ t('portal.registerTitle') }}</h1>
      <p class="auth-subtitle">{{ t('portal.registerSubtitle') }}</p>

      <el-form label-position="top" @submit.prevent="handleRegister">
        <el-form-item :label="t('portal.username')" required>
          <el-input v-model="form.username" size="large" autocomplete="username" :prefix-icon="User" :placeholder="t('portal.usernameRule')" />
        </el-form-item>
        <el-form-item :label="t('portal.nickname')">
          <el-input v-model="form.nickname" size="large" :placeholder="t('portal.nicknamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('portal.email')">
          <el-input v-model="form.email" size="large" type="email" autocomplete="email" />
        </el-form-item>
        <el-form-item :label="t('portal.password')" required>
          <el-input v-model="form.password" size="large" type="password" show-password autocomplete="new-password" :prefix-icon="Lock" />
        </el-form-item>
        <el-form-item :label="t('portal.confirmPassword')" required>
          <el-input
            v-model="form.confirmPassword"
            size="large"
            type="password"
            show-password
            autocomplete="new-password"
            :prefix-icon="Lock"
            @keyup.enter="handleRegister"
          />
        </el-form-item>
        <el-button type="primary" size="large" class="auth-submit" :loading="submitting" @click="handleRegister">
          {{ t('portal.register') }}
        </el-button>
      </el-form>

      <div class="auth-footer">
        <span>{{ t('portal.hasAccount') }}</span>
        <el-button link type="primary" @click="goLogin">{{ t('portal.login') }}</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { portalApi } from '@/api'
import { useUserStore } from '@/stores'
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const form = reactive({ username: '', nickname: '', email: '', password: '', confirmPassword: '' })
const submitting = ref(false)

const handleRegister = async (): Promise<void> => {
  if (!form.username.trim()) {
    ElMessage.warning(t('portal.usernameRequired'))
    return
  }
  if (form.password.length < 6) {
    ElMessage.warning(t('portal.passwordRule'))
    return
  }
  if (form.password !== form.confirmPassword) {
    ElMessage.warning(t('portal.passwordMismatch'))
    return
  }
  submitting.value = true
  try {
    await portalApi.register({
      username: form.username.trim(),
      password: form.password,
      nickname: form.nickname.trim() || undefined,
      email: form.email.trim() || undefined,
    })
    ElMessage.success(t('portal.registerSuccess'))
    void router.push({ path: '/portal/login', query: route.query })
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitting.value = false
  }
}

const goLogin = (): void => {
  void router.push({ path: '/portal/login', query: route.query })
}

onMounted(() => {
  if (userStore.isLoggedIn) void router.push('/portal/prompts')
})
</script>

<style scoped>
.auth-page {
  display: flex;
  justify-content: center;
  padding: 40px 0 60px;
}

.auth-card {
  width: 100%;
  max-width: 420px;
  padding: 34px 32px;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
}

.auth-card h1 {
  margin: 0 0 8px;
  font-size: 24px;
  text-align: center;
}

.auth-subtitle {
  margin: 0 0 28px;
  font-size: 13px;
  line-height: 1.7;
  text-align: center;
  color: var(--ink-3);
}

.auth-submit {
  width: 100%;
  margin-top: 8px;
  border-radius: var(--radius-sm);
}

.auth-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 20px;
  font-size: 13px;
  color: var(--ink-3);
}
</style>
