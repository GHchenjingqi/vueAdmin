<template>
  <div class="login-page">
    <!-- 语言切换 -->
    <div class="login-locale">
      <el-dropdown trigger="click" @command="handleLocaleChange">
        <el-button text :icon="localeIcon">
          {{ locale === 'zh-CN' ? '简体中文' : 'English' }}
          <el-icon><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="zh-CN" :class="{ active: locale === 'zh-CN' }">
              <span>简体中文</span>
              <el-icon v-if="locale === 'zh-CN'" class="locale-checked">
                <Check />
              </el-icon>
            </el-dropdown-item>
            <el-dropdown-item command="en-US" :class="{ active: locale === 'en-US' }">
              <span>English</span>
              <el-icon v-if="locale === 'en-US'" class="locale-checked">
                <Check />
              </el-icon>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <!-- 左上角品牌标识 -->
    <div class="brand-header">
      <div class="brand-logo">
        <img v-if="siteLogo" :src="siteLogo" alt="Logo" class="brand-logo-img" />
        <el-icon v-else :size="36" color="var(--mainColor, #409eff)">
          <Odometer />
        </el-icon>
      </div>
      <div class="brand-header-text">
        <h1 class="brand-title">
          {{ siteTitle || 'Vue Admin' }}
        </h1>
        <p class="brand-desc">
          {{ t('login.welcome') }}
        </p>
      </div>
    </div>
    <!-- 左侧品牌展示区 -->
    <div class="login-brand">
      <div class="brand-bg">
        <div class="brand-circle brand-circle--1" />
        <div class="brand-circle brand-circle--2" />
        <div class="brand-circle brand-circle--3" />
      </div>
    </div>

    <!-- 右侧登录表单区 -->
    <div class="login-form-wrap">
      <div class="login-form-container">
        <!-- 登录标题 -->
        <div class="login-header">
          <h2>{{ t('login.title') }}</h2>
          <p>{{ t('login.subtitle') }}</p>
        </div>

        <!-- 登录表单 -->
        <el-form ref="formRef" :model="form" :rules="rules" size="large" class="login-form" aria-label="登录表单" @keyup.enter="handleLogin">
          <el-form-item prop="username">
            <el-input
              v-model="form.username"
              :placeholder="t('login.username')"
              :prefix-icon="User"
              clearable
              aria-required="true"
              :aria-label="t('login.username')"
            />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              :placeholder="t('login.password')"
              :prefix-icon="Lock"
              show-password
              clearable
              aria-required="true"
              :aria-label="t('login.password')"
            />
          </el-form-item>
          <el-form-item v-if="captchaEnabled" prop="captchaText">
            <div class="captcha-row">
              <el-input
                v-model="form.captchaText"
                :placeholder="t('login.captcha')"
                :prefix-icon="Key"
                class="captcha-input"
                aria-required="true"
                :aria-label="t('login.captcha')"
              />
              <!-- eslint-disable vue/no-v-html -->
              <div
                class="captcha-svg"
                :title="t('login.clickRefresh')"
                role="button"
                :aria-label="t('login.clickRefresh')"
                tabindex="0"
                @click="refreshCaptcha"
                @keydown.enter.prevent="refreshCaptcha"
                v-html="sanitizedCaptchaSvg"
              />
              <!-- eslint-enable vue/no-v-html -->
            </div>
          </el-form-item>
          <el-form-item class="login-options">
            <el-checkbox v-model="form.rememberMe">
              {{ t('login.rememberMe') }}
            </el-checkbox>
            <el-link type="primary" :underline="false" @click="showForgotDialog = true">
              {{ t('login.forgotPassword') }}
            </el-link>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" :disabled="loginDisabled" class="login-btn" @click="handleLogin">
              {{ loginButtonText }}
            </el-button>
          </el-form-item>
        </el-form>

        <!-- 底部版权 -->
        <div class="login-copyright">
          <p>{{ t('login.copyright', { year: new Date().getFullYear() }) }}</p>
        </div>
      </div>
    </div>

    <!-- 忘记密码对话框 -->
    <el-dialog v-model="showForgotDialog" :title="t('login.forgotPassword')" width="420px" :close-on-click-modal="false" destroy-on-close>
      <el-form ref="forgotFormRef" :model="forgotForm" :rules="forgotRules">
        <el-form-item prop="email" :label="t('login.email')">
          <el-input v-model="forgotForm.email" :placeholder="t('login.inputEmail')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showForgotDialog = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button :loading="forgotLoading" type="primary" @click="handleForgotPassword">
          {{ t('login.sendResetEmail') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { Odometer, User, Lock, Key, ArrowDown, Check } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { authApi, siteApi } from '@/api'
import { sanitizeSvg } from '@/utils/sanitize'
import type { LoginParams, LoginResult } from '@/api/auth'
import { useUserStore, useAppStore } from '@/stores'
import { useI18n } from '@/i18n'
import { initDynamicRoutes } from '@/router/initSession'
import { useMenuStore } from '@/stores'

const router = useRouter()
const userStore = useUserStore()
const appStore = useAppStore()
const { t, locale, setLocale: i18nSetLocale } = useI18n()

const localeIcon = computed(() => undefined)

function handleLocaleChange(l: string): void {
  const locale = l as 'zh-CN' | 'en-US'
  i18nSetLocale(locale)
  appStore.setLocale(locale)
  // 清除表单验证错误，使已显示的提示随语言更新
  formRef.value?.clearValidate()
  forgotFormRef.value?.clearValidate()
}

/** 监听语言变化，同步清除表单验证错误 */
watch(locale, () => {
  formRef.value?.clearValidate()
  forgotFormRef.value?.clearValidate()
})

const formRef = ref<InstanceType<(typeof import('element-plus'))['ElForm']> | null>(null)
const forgotFormRef = ref<InstanceType<(typeof import('element-plus'))['ElForm']> | null>(null)
const loading = ref(false)
const forgotLoading = ref(false)
const showForgotDialog = ref(false)

const captchaEnabled = ref(false)
const captchaSvg = ref('')
const captchaKey = ref('')
const sanitizedCaptchaSvg = computed(() => sanitizeSvg(captchaSvg.value))

const siteTitle = ref(appStore.siteTitle || '')
const siteLogo = ref(appStore.siteLogo || '')

const form = reactive({
  username: '',
  password: '',
  captchaText: '',
  rememberMe: false,
})

const forgotForm = reactive({
  email: '',
})

const rules = computed(() => ({
  username: [{ required: true, message: t('login.inputUsername'), trigger: 'blur' as const }],
  password: [{ required: true, message: t('login.inputPassword'), trigger: 'blur' as const }],
}))

const forgotRules = computed(() => ({
  email: [
    { required: true, message: t('login.inputEmail'), trigger: 'blur' as const },
    { type: 'email' as const, message: t('login.validEmail'), trigger: 'blur' as const },
  ],
}))

const refreshCaptcha = async (): Promise<void> => {
  try {
    const res = await authApi.captcha()
    captchaEnabled.value = res.data.enabled
    if (captchaEnabled.value) {
      captchaSvg.value = res.data.svg!
      captchaKey.value = res.data.key!
      form.captchaText = ''
    }
  } catch {
    captchaEnabled.value = false
  }
}

// ==================== 登录频率限制 / 重试倒计时 ====================
const retryCountdown = ref(0)
let retryTimer: ReturnType<typeof setInterval> | null = null

function startRetryCountdown(seconds: number): void {
  retryCountdown.value = seconds
  if (retryTimer) clearInterval(retryTimer)
  retryTimer = setInterval(() => {
    if (retryCountdown.value > 0) {
      retryCountdown.value--
    } else {
      if (retryTimer) {
        clearInterval(retryTimer)
        retryTimer = null
      }
    }
  }, 1000)
}

const loginDisabled = computed(() => loading.value || retryCountdown.value > 0)

const loginButtonText = computed(() => {
  if (loading.value) return t('login.loggingIn')
  if (retryCountdown.value > 0) return `${t('login.retryAfter')} ${retryCountdown.value}s`
  return t('login.login')
})

function extractRetryAfter(error: unknown): number {
  const err = error as { response?: { data?: { message?: string }; status?: number } }
  if (err.response?.status === 429) {
    const msg = err.response.data?.message || ''
    const match = msg.match(/(\d+)\s*秒/)
    if (match) return Math.min(parseInt(match[1], 10), 120)
    return 30
  }
  if (err.response?.status === 423) {
    const msg = err.response.data?.message || ''
    const match = msg.match(/(\d+)\s*秒/)
    if (match) return Math.min(parseInt(match[1], 10), 1800)
    return 1800
  }
  return 0
}

const handleLogin = async (): Promise<void> => {
  if (retryCountdown.value > 0) return

  const valid = (await formRef.value?.validate().catch(() => false)) ?? false
  if (!valid) return

  loading.value = true
  try {
    const loginData: LoginParams = {
      username: form.username,
      password: form.password,
      rememberMe: form.rememberMe,
    }
    if (captchaEnabled.value) {
      loginData.captchaKey = captchaKey.value
      loginData.captchaText = form.captchaText
    }
    const res = await authApi.login(loginData)
    const result = res.data as LoginResult

    userStore.login({ ...result.user, roles: result.roles || [], permissions: result.permissions || [] }, result.accessToken)
    if (result.passwordResetRequired) {
      userStore.setPasswordResetRequired(true)
    }

    if (result.passwordResetRequired) {
      router.push('/force-password-change')
    } else {
      ElMessage.success(t('login.loginSuccess'))
      // 登录成功后先注册动态路由（拉取菜单 + addRoute），再跳转，
      // 避免 Layout 异步 onMounted 注册路由的时序竞争导致白屏/需刷新。
      try {
        await initDynamicRoutes()
      } catch (e: unknown) {
        console.error('登录后初始化动态路由失败:', e)
      }
      const menuStore = useMenuStore()
      const firstPath = menuStore.findFirstMenuPath()
      router.push(firstPath || '/')
    }
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } }; message?: string }
    const message = axiosErr.response?.data?.message || axiosErr.message || t('login.loginFailed')
    ElMessage.error(message)
    refreshCaptcha()

    const countdown = extractRetryAfter(err)
    if (countdown > 0) {
      startRetryCountdown(countdown)
    }
  } finally {
    loading.value = false
  }
}

onUnmounted(() => {
  if (retryTimer) {
    clearInterval(retryTimer)
    retryTimer = null
  }
})

const handleForgotPassword = async (): Promise<void> => {
  const valid = (await forgotFormRef.value?.validate().catch(() => false)) ?? false
  if (!valid) return

  forgotLoading.value = true
  try {
    await authApi.forgotPassword(forgotForm.email)
    ElMessage.success(t('login.emailRegistered'))
    showForgotDialog.value = false
  } catch (err: unknown) {
    const error = err as { message?: string }
    ElMessage.error(error.message || t('login.sendFailed'))
  } finally {
    forgotLoading.value = false
  }
}

const fetchSettings = async (): Promise<void> => {
  try {
    const res = await siteApi.info()
    if (res.data) {
      const data = res.data as { title?: string; logo?: string }
      if (data.title) {
        siteTitle.value = data.title
        appStore.setSiteInfo({ title: data.title })
      }
      if (data.logo) {
        siteLogo.value = data.logo
        appStore.setSiteInfo({ logo: data.logo })
      }
    }
  } catch {
    // 站点信息获取失败，使用默认标题和Logo
  }
}

onMounted(() => {
  fetchSettings()
  refreshCaptcha()
})
</script>

<style lang="scss" scoped>
.login-page {
  display: flex;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

/* ========== 左上角品牌标识 ========== */
.brand-header {
  position: absolute;
  top: 20px;
  left: 24px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-header-text {
  display: flex;
  flex-direction: column;
}

.brand-header .brand-logo {
  margin-bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-header .brand-logo-img {
  width: 40px;
  height: 40px;
}

.brand-header .brand-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary, #303133);
  text-shadow: none;
  line-height: 1.2;
}

.brand-header .brand-desc {
  font-size: 12px;
  opacity: 0.65;
  margin: 0;
  line-height: 1.2;
}

/* ========== 左侧品牌展示区 ========== */
.login-brand {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(135deg, var(--mainColor, #409eff) 0%, #667eea 50%, #764ba2 100%);
}

.brand-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.brand-circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  animation: float 20s ease-in-out infinite;
}

.brand-circle--1 {
  width: 600px;
  height: 600px;
  top: -10%;
  right: -10%;
  animation-delay: 0s;
}

.brand-circle--2 {
  width: 400px;
  height: 400px;
  bottom: -5%;
  left: -5%;
  animation-delay: -5s;
}

.brand-circle--3 {
  width: 300px;
  height: 300px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation-delay: -10s;
}

@keyframes float {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  25% {
    transform: translate(30px, -30px) scale(1.05);
  }
  50% {
    transform: translate(-20px, 20px) scale(0.95);
  }
  75% {
    transform: translate(20px, 30px) scale(1.02);
  }
}

/* ========== 右侧表单区 ========== */
.login-form-wrap {
  width: 520px;
  min-width: 520px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--card-bg, #fff);
  position: relative;
}

.login-form-container {
  width: 100%;
  max-width: 380px;
  padding: 0 40px;
}

.login-locale {
  position: absolute;
  top: 20px;
  right: 24px;
  z-index: 10;
}

.login-locale :deep(.el-button) {
  color: var(--text-secondary, #909399);
  font-size: 13px;
}

.locale-checked {
  color: var(--mainColor, #409eff);
  margin-left: 4px;
}

.login-header {
  margin-bottom: 32px;
}

.login-header h2 {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary, #303133);
  margin: 0 0 8px;
}

.login-header p {
  font-size: 14px;
  color: var(--text-secondary, #909399);
  margin: 0;
}

.login-form {
  width: 100%;
}

.login-form :deep(.el-input__wrapper) {
  background: var(--content-bg, #f5f6fa);
  box-shadow: none;
  border: 1px solid transparent;
  transition: all 0.25s;
}

.login-form :deep(.el-input__wrapper:hover) {
  background: var(--card-bg, #fff);
  border-color: var(--el-border-color, #dcdfe6);
}

.login-form :deep(.el-input__wrapper.is-focus) {
  background: var(--card-bg, #fff);
  border-color: var(--mainColor, #409eff);
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.12);
}

.login-form :deep(.el-input__inner) {
  height: 44px;
}

.login-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.login-options :deep(.el-form-item__content) {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.login-btn {
  width: 100%;
  height: 44px;
  font-size: 16px;
  border-radius: 8px;
  letter-spacing: 1px;
}

.login-copyright {
  position: absolute;
  bottom: 40px;
  left: 0;
  right: 0;
  text-align: center;
}

.login-copyright p {
  font-size: 12px;
  color: var(--text-secondary, #909399);
  margin: 0;
}

/* ========== 验证码 ========== */
.captcha-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.captcha-input {
  flex: 1;
}

.captcha-svg {
  cursor: pointer;
  flex-shrink: 0;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--el-border-color, #dcdfe6);
  line-height: 0;
  transition: border-color 0.25s;
}

.captcha-svg:hover {
  border-color: var(--mainColor, #409eff);
}

/* ========== 响应式 ========== */
@media (max-width: 900px) {
  .login-brand {
    display: none;
  }

  .login-form-wrap {
    width: 100%;
    min-width: 0;
  }

  .login-form-container {
    max-width: 400px;
  }
}

@media (max-width: 480px) {
  .login-form-container {
    padding: 0 20px;
  }

  .login-header h2 {
    font-size: 24px;
  }
}
</style>
