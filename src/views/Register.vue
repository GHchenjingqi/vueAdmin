<template>
  <el-card shadow="hover">
    <template #header>
      <span>{{ t('register.title') }}</span>
    </template>
    <el-row justify="center">
      <el-col :xs="24" :sm="12" :md="12">
        <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
          <el-form-item :label="t('register.username')" prop="username">
            <el-input v-model="form.username" :placeholder="t('register.inputUsername')" />
          </el-form-item>
          <el-form-item :label="t('register.password')" prop="password">
            <el-input v-model="form.password" type="password" show-password :placeholder="t('register.inputPassword')" />
          </el-form-item>
          <el-form-item :label="t('register.confirmPassword')" prop="confirmPassword">
            <el-input v-model="form.confirmPassword" type="password" show-password :placeholder="t('register.confirmPassword2')" />
          </el-form-item>
          <el-form-item :label="t('register.email')" prop="email">
            <el-input v-model="form.email" :placeholder="t('register.inputEmail')" />
          </el-form-item>
          <el-form-item :label="t('register.phone')" prop="phone">
            <el-input v-model="form.phone" :placeholder="t('register.inputPhone')" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" @click="handleRegister">
              {{ t('register.register') }}
            </el-button>
            <el-button @click="resetForm">
              {{ t('register.reset') }}
            </el-button>
          </el-form-item>
        </el-form>
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { userApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { createPasswordStrengthValidator, createConfirmValidator } from '@/utils/validators'
import { useI18n } from '@/i18n'

const { t } = useI18n()
const formRef = ref<InstanceType<typeof import('element-plus').ElForm> | null>(null)
const loading = ref(false)

let form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  email: '',
  phone: '',
})

const rules = {
  username: [{ required: true, message: t('register.inputUsername'), trigger: 'blur' }],
  password: [
    { required: true, message: t('register.inputPassword'), trigger: 'blur' },
    { validator: createPasswordStrengthValidator, trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: t('register.confirmPassword2'), trigger: 'blur' },
    { validator: createConfirmValidator(() => form.password), trigger: 'blur' },
  ],
  email: [
    { required: true, message: t('register.inputEmail'), trigger: 'blur' },
    { type: 'email' as const, message: t('register.emailFormatError'), trigger: 'blur' },
  ],
}

const handleRegister = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const payload: Record<string, unknown> = {
      username: form.username,
      password: form.password,
      email: form.email,
      phone: form.phone,
      status: 1,
    }
    await userApi.create(payload)
    ElMessage.success(t('register.registerSuccess'))
  } catch (err: unknown) {
    ElMessage.error(t('register.registerFailed') + ': ' + (getErrorMessage(err) || t('common.unknownError')))
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  formRef.value?.resetFields()
}
</script>
