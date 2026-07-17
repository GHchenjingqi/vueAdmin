<template>
  <div class="page-container">
    <el-card shadow="never">
      <el-tabs v-model="activeTab" class="profile-tabs">
        <!-- ====== 个人信息 ====== -->
        <el-tab-pane :label="t('profile.personalInfo')" name="info">
          <el-form ref="formRef" :model="form" :rules="rules" label-width="80px" size="default" class="profile-form">
            <el-form-item :label="t('profile.avatar')">
              <div class="avatar-section">
                <div class="avatar-wrapper" @click="triggerUpload">
                  <el-avatar :size="100" :src="avatarPreview" class="profile-avatar">
                    <span class="avatar-fallback">{{ form.username?.charAt(0)?.toUpperCase() }}</span>
                  </el-avatar>
                  <div class="avatar-overlay">
                    <el-icon :size="24">
                      <Camera />
                    </el-icon>
                    <span>{{ t('profile.changeAvatar') }}</span>
                  </div>
                </div>
                <div class="avatar-controls">
                  <el-upload
                    ref="uploadRef"
                    :action="uploadUrl"
                    :headers="uploadHeaders"
                    :show-file-list="false"
                    :on-success="handleAvatarUpload"
                    :before-upload="beforeAvatarUpload"
                    accept="image/*"
                    style="display: none"
                  >
                    <el-button type="primary">
                      <el-icon><Upload /></el-icon>
                      {{ t('profile.selectImage') }}
                    </el-button>
                  </el-upload>
                </div>
              </div>
            </el-form-item>
            <el-form-item :label="t('common.name')">
              <el-input v-model="form.username" disabled />
            </el-form-item>
            <el-form-item :label="t('profile.nickname')">
              <el-input v-model="form.nickname" :placeholder="t('profile.inputNickname')" maxlength="30" show-word-limit />
            </el-form-item>
            <el-form-item :label="t('profile.email')" prop="email">
              <el-input v-model="form.email" :placeholder="t('profile.inputEmail')" />
            </el-form-item>
            <el-form-item :label="t('profile.phone')" prop="phone">
              <el-input v-model="form.phone" :placeholder="t('profile.inputPhone')" />
            </el-form-item>
            <el-form-item :label="t('profile.bio')" prop="bio">
              <el-input v-model="form.bio" type="textarea" :rows="3" maxlength="200" show-word-limit :placeholder="t('profile.inputBio')" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="saving" @click="handleSave">
                {{ t('profile.saveChanges') }}
              </el-button>
              <el-button @click="handleReset">
                {{ t('profile.reset') }}
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- ====== 修改密码 ====== -->
        <el-tab-pane :label="t('profile.changePassword')" name="password">
          <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-width="80px" size="default" class="profile-form">
            <el-form-item :label="t('profile.oldPassword')" prop="oldPassword">
              <el-input v-model="pwdForm.oldPassword" type="password" show-password :placeholder="t('profile.inputOldPwd')" />
            </el-form-item>
            <el-form-item :label="t('profile.newPassword')" prop="newPassword">
              <el-input v-model="pwdForm.newPassword" type="password" show-password :placeholder="t('profile.inputNewPwd')" />
            </el-form-item>
            <el-form-item :label="t('profile.confirmPassword')" prop="confirmPassword">
              <el-input v-model="pwdForm.confirmPassword" type="password" show-password :placeholder="t('profile.inputConfirmPwd')" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="changingPwd" @click="handleChangePwd">
                {{ t('profile.confirmChange') }}
              </el-button>
              <el-button @click="handleResetPwd">
                {{ t('profile.reset') }}
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Camera, Upload } from '@element-plus/icons-vue'
import { authApi, userApi } from '@/api'
import { getAccessToken } from '@/utils/request'
import { useUserStore } from '@/stores'
import { createPasswordStrengthValidator, createConfirmValidator } from '@/utils/validators'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const userStore = useUserStore()
const { t } = useI18n()

const activeTab = ref('info')
const formRef = ref<InstanceType<(typeof import('element-plus'))['ElForm']> | null>(null)
const pwdFormRef = ref<InstanceType<(typeof import('element-plus'))['ElForm']> | null>(null)
const uploadRef = ref(null)
const saving = ref(false)
const changingPwd = ref(false)
const originalData: Record<string, string> = {}

let form = reactive({
  username: '',
  nickname: '',
  email: '',
  phone: '',
  avatar: '',
  bio: '',
})

const pwdForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const uploadUrl = '/api/upload'
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${getAccessToken()}`,
}))

const avatarPreview = computed(() => {
  if (!form.avatar) return ''
  if (form.avatar.startsWith('http')) return form.avatar
  return form.avatar
})

const rules = {
  email: [{ type: 'email' as const, message: t('profile.emailFormatError'), trigger: 'blur' }],
}

const pwdRules = {
  oldPassword: [{ required: true, message: t('profile.inputOldPwdRequired'), trigger: 'blur' }],
  newPassword: [
    { required: true, message: t('profile.inputNewPwdRequired'), trigger: 'blur' },
    { min: 8, message: t('profile.pwdMinLength'), trigger: 'blur' },
    { validator: createPasswordStrengthValidator, trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: t('profile.inputConfirmPwdRequired'), trigger: 'blur' },
    { validator: createConfirmValidator(() => pwdForm.newPassword), trigger: 'blur' },
  ],
}

const triggerUpload = () => {
  const uploadEl = uploadRef.value as unknown as { $el: HTMLElement }
  uploadEl?.$el?.querySelector('input')?.click()
}

const fetchProfile = async () => {
  try {
    const res = await authApi.profile()
    if (res.data) {
      const user = res.data
      form.username = user.username || ''
      form.nickname = user.nickname || ''
      form.email = user.email || ''
      form.phone = user.phone || ''
      form.avatar = user.avatar || ''
      form.bio = user.bio || t('profile.lazyBio')
      originalData.username = form.username
      originalData.nickname = form.nickname
      originalData.email = form.email
      originalData.phone = form.phone
      originalData.avatar = form.avatar
      originalData.bio = form.bio
    }
  } catch (err: unknown) {
    ElMessage.error(t('profile.fetchFailed') + ': ' + (getErrorMessage(err) || t('common.unknownError')))
  }
}

const beforeAvatarUpload = (file: File) => {
  const isImage = file.type.startsWith('image/')
  const isLt2M = file.size / 1024 / 1024 < 2
  if (!isImage) {
    ElMessage.error(t('profile.imageOnly'))
    return false
  }
  if (!isLt2M) {
    ElMessage.error(t('profile.imageSizeLimit'))
    return false
  }
  return true
}

const handleAvatarUpload = (res: { code: number; data?: unknown; message?: string }) => {
  if (res.code === 0 && res.data) {
    const data = res.data as Record<string, string>
    form.avatar = typeof res.data === 'string' ? res.data : data.url || data.path
  } else {
    ElMessage.error(t('profile.avatarUploadFailed'))
  }
}

const handleSave = async () => {
  const formEl = formRef.value
  if (!formEl) return
  const valid = await formEl.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    const userId = userStore.userInfo?.id
    if (!userId) {
      ElMessage.error(t('profile.cannotGetUserId'))
      return
    }

    const payload: Record<string, string> = {}
    if (form.nickname !== originalData.nickname) payload.nickname = form.nickname
    if (form.email !== originalData.email) payload.email = form.email
    if (form.phone !== originalData.phone) payload.phone = form.phone
    if (form.avatar !== originalData.avatar) payload.avatar = form.avatar
    if (form.bio !== originalData.bio) payload.bio = form.bio

    if (Object.keys(payload).length === 0) {
      ElMessage.info(t('profile.noChanges'))
      saving.value = false
      return
    }

    await userApi.update(userId, payload)

    originalData.nickname = form.nickname
    originalData.email = form.email
    originalData.phone = form.phone
    originalData.avatar = form.avatar
    originalData.bio = form.bio

    userStore.updateUserInfo(payload)

    ElMessage.success(t('profile.profileUpdated'))
  } catch (err: unknown) {
    ElMessage.error(t('profile.saveFailed') + ': ' + (getErrorMessage(err) || t('common.unknownError')))
  } finally {
    saving.value = false
  }
}

const handleReset = () => {
  form.nickname = originalData.nickname
  form.email = originalData.email
  form.phone = originalData.phone
  form.avatar = originalData.avatar
  form.bio = originalData.bio
  formRef.value?.clearValidate()
}

const handleChangePwd = async () => {
  const formEl = pwdFormRef.value
  if (!formEl) return
  const valid = await formEl.validate().catch(() => false)
  if (!valid) return

  changingPwd.value = true
  try {
    await authApi.changePassword({
      oldPassword: pwdForm.oldPassword,
      newPassword: pwdForm.newPassword,
    })
    ElMessage.success(t('profile.pwdChangeSuccess'))
    pwdForm.oldPassword = ''
    pwdForm.newPassword = ''
    pwdForm.confirmPassword = ''
    pwdFormRef.value?.resetFields()
  } catch (err: unknown) {
    ElMessage.error(t('profile.pwdChangeFailed') + ': ' + (getErrorMessage(err) || t('common.unknownError')))
  } finally {
    changingPwd.value = false
  }
}

const handleResetPwd = () => {
  pwdForm.oldPassword = ''
  pwdForm.newPassword = ''
  pwdForm.confirmPassword = ''
  pwdFormRef.value?.clearValidate()
}

onMounted(() => {
  fetchProfile()
})
</script>

<style lang="scss" scoped>
.profile-page {
  max-width: 680px;
}

.table-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--card-bg);
}

.table-card :deep(.el-card__header) {
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-light);
  background: var(--card-header-bg);
}
</style>
