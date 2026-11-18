<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1>{{ t('portal.loginTitle') }}</h1>
      <p class="auth-subtitle">{{ t('portal.loginSubtitle') }}</p>

      <el-form label-position="top" @submit.prevent="handleLogin">
        <el-form-item :label="t('portal.username')">
          <el-input v-model="form.username" size="large" autocomplete="username" :prefix-icon="User" />
        </el-form-item>
        <el-form-item :label="t('portal.password')">
          <el-input
            v-model="form.password"
            size="large"
            type="password"
            show-password
            autocomplete="current-password"
            :prefix-icon="Lock"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item v-if="captchaEnabled" :label="t('portal.captcha')">
          <div class="auth-captcha">
            <el-input v-model="form.captchaText" size="large" :placeholder="t('portal.captchaPlaceholder')" />
            <img
              v-if="captchaSrc"
              :src="captchaSrc"
              :alt="t('portal.captcha')"
              class="auth-captcha-img"
              role="button"
              :title="t('portal.captchaRefresh')"
              @click="refreshCaptcha"
            />
          </div>
        </el-form-item>
        <el-button type="primary" size="large" class="auth-submit" :loading="submitting" @click="handleLogin">
          {{ t('portal.login') }}
        </el-button>
      </el-form>

      <div class="auth-footer">
        <span>{{ t('portal.noAccount') }}</span>
        <el-button link type="primary" @click="goRegister">{{ t('portal.register') }}</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { authApi, type LoginResult } from '@/api/auth'
import { useUserStore } from '@/stores'
import { useI18n } from '@/i18n'
import { initDynamicRoutes } from '@/router/initSession'
import { getErrorMessage } from '@/utils/error'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const form = reactive({ username: '', password: '', captchaText: '' })
const captchaEnabled = ref(false)
const captchaSvg = ref('')
const captchaKey = ref('')
const submitting = ref(false)

const captchaSrc = computed(() => (captchaSvg.value ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(captchaSvg.value)}` : ''))
const redirectPath = computed(() => (typeof route.query.redirect === 'string' ? route.query.redirect : '/portal/prompts'))

const refreshCaptcha = async (): Promise<void> => {
  try {
    const res = await authApi.captcha()
    captchaEnabled.value = res.data.enabled
    captchaSvg.value = res.data.svg ?? ''
    captchaKey.value = res.data.key ?? ''
    form.captchaText = ''
  } catch {
    captchaEnabled.value = false
  }
}

const handleLogin = async (): Promise<void> => {
  if (!form.username.trim() || !form.password) {
    ElMessage.warning(t('portal.credentialsRequired'))
    return
  }
  submitting.value = true
  try {
    const res = await authApi.login({
      username: form.username.trim(),
      password: form.password,
      ...(captchaEnabled.value ? { captchaKey: captchaKey.value, captchaText: form.captchaText } : {}),
    })
    const result = res.data as LoginResult
    userStore.login({ ...result.user, roles: result.roles || [], permissions: result.permissions || [] }, result.accessToken)
    // 前台首次加载时未登录，App.vue 不会注册动态路由；此处补注册，
    // 否则登录后直接点「后台管理」会命中 404。
    try {
      await initDynamicRoutes()
    } catch (e: unknown) {
      console.error('登录后初始化动态路由失败:', e)
    }
    ElMessage.success(t('portal.loginSuccess'))
    void router.push(redirectPath.value)
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
    if (captchaEnabled.value) await refreshCaptcha()
  } finally {
    submitting.value = false
  }
}

const goRegister = (): void => {
  void router.push({ path: '/portal/register', query: route.query })
}

onMounted(() => void refreshCaptcha())
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

.auth-captcha {
  display: flex;
  gap: 10px;
  width: 100%;
}

.auth-captcha-img {
  height: 40px;
  flex: 1;
  min-width: 0;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  cursor: pointer;
  object-fit: cover;
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
