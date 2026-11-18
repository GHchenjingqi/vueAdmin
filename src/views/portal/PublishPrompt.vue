<template>
  <div class="publish-page">
    <div class="publish-head">
      <h1>{{ isEdit ? t('portal.editTitle') : t('portal.publishTitle') }}</h1>
      <p>{{ t('portal.submitHint') }}</p>
    </div>

    <div v-loading="loading" class="publish-card">
      <el-form label-position="top" @submit.prevent>
        <el-form-item :label="t('portal.title')" required>
          <el-input v-model="form.title" maxlength="200" show-word-limit :placeholder="t('portal.titlePlaceholder')" />
        </el-form-item>

        <div class="publish-row">
          <el-form-item :label="t('portal.category')" required>
            <el-select v-model="form.categoryId" :placeholder="t('portal.categoryPlaceholder')" style="width: 100%">
              <el-option v-for="category in categories" :key="category.id" :label="category.name" :value="category.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('portal.model')" required>
            <el-input v-model="form.modelName" maxlength="100" :placeholder="t('portal.modelPlaceholder')" />
          </el-form-item>
        </div>

        <el-form-item :label="t('portal.content')" required>
          <el-input v-model="form.content" type="textarea" :rows="9" :placeholder="t('portal.contentPlaceholder')" />
        </el-form-item>

        <el-form-item :label="t('portal.images')" required>
          <PlatformImageGroups v-model="form.platformGroups" :platforms="platforms" />
        </el-form-item>

        <div class="publish-actions">
          <el-button @click="goMine">{{ t('common.cancel') }}</el-button>
          <el-button :loading="submitting" @click="handleSubmit(false)">{{ t('portal.saveDraft') }}</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmit(true)">{{ t('portal.submitReview') }}</el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { portalApi, type PortalCategory, type PortalPayload } from '@/api'
import type { PromptImageGroupInput, PromptPlatform } from '@/api/prompt'
import { useUserStore } from '@/stores'
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'
import PlatformImageGroups from './components/PlatformImageGroups.vue'

interface PublishForm {
  title: string
  content: string
  categoryId: number | ''
  modelName: string
  platformGroups: PromptImageGroupInput[]
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const categories = ref<PortalCategory[]>([])
const platforms = ref<PromptPlatform[]>([])
const form = reactive<PublishForm>({ title: '', content: '', categoryId: '', modelName: '', platformGroups: [] })
const loading = ref(false)
const submitting = ref(false)
const editId = computed(() => Number(route.params.id) || 0)
const isEdit = computed(() => editId.value > 0)

const goMine = (): void => {
  void router.push('/portal/mine')
}

const load = async (): Promise<void> => {
  if (!userStore.isLoggedIn) {
    ElMessage.warning(t('portal.loginRequired'))
    void router.push({ path: '/portal/login', query: { redirect: route.fullPath } })
    return
  }
  loading.value = true
  try {
    const [categoryRes, platformRes] = await Promise.all([portalApi.getCategories(), portalApi.getPlatforms()])
    categories.value = categoryRes.data
    platforms.value = platformRes.data
    if (isEdit.value) {
      const res = await portalApi.getMinePrompt(editId.value)
      form.title = res.data.title
      form.content = res.data.content
      form.categoryId = res.data.categoryId
      form.modelName = res.data.modelName
      const groups = res.data.platformGroups?.length
        ? res.data.platformGroups
        : res.data.images?.length
          ? [{ platformId: res.data.images[0].platformId || platformRes.data[0]?.id || 1, images: res.data.images, coverImage: '' }]
          : []
      form.platformGroups = groups.map((group) => ({
        platformId: group.platformId,
        images: group.images.map((image) => ({
          url: image.url,
          filePath: image.filePath ?? null,
          sort: image.sort,
          isCover: Boolean(image.isCover),
        })),
      }))
    } else if (platformRes.data.length) {
      form.platformGroups = [{ platformId: platformRes.data[0].id, images: [] }]
    }
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const handleSubmit = async (submit: boolean): Promise<void> => {
  if (!form.title.trim()) {
    ElMessage.warning(t('portal.titleRequired'))
    return
  }
  if (!form.content.trim()) {
    ElMessage.warning(t('portal.contentRequired'))
    return
  }
  if (!form.categoryId) {
    ElMessage.warning(t('portal.categoryRequired'))
    return
  }
  if (!form.modelName.trim()) {
    ElMessage.warning(t('portal.modelRequired'))
    return
  }
  const totalImages = form.platformGroups.reduce((sum, group) => sum + group.images.length, 0)
  if (submit && totalImages === 0) {
    ElMessage.warning(t('portal.imageRequired'))
    return
  }
  if (form.platformGroups.some((group) => group.images.length > 20)) {
    ElMessage.warning(t('portal.imageGroupLimit'))
    return
  }
  if (new Set(form.platformGroups.map((group) => group.platformId)).size !== form.platformGroups.length) {
    ElMessage.warning(t('portal.platformDuplicate'))
    return
  }

  const payload: PortalPayload = {
    title: form.title.trim(),
    content: form.content.trim(),
    categoryId: Number(form.categoryId),
    modelName: form.modelName.trim(),
    submit,
    platformGroups: form.platformGroups
      .filter((group) => group.images.length > 0)
      .map((group) => ({
        platformId: Number(group.platformId),
        images: group.images.map((image, index) => ({
          url: image.url,
          filePath: image.filePath ?? null,
          sort: index,
          isCover: Boolean(image.isCover),
        })),
      })),
  }

  submitting.value = true
  try {
    if (isEdit.value) await portalApi.updateMine(editId.value, payload)
    else await portalApi.createMine(payload)
    ElMessage.success(submit ? t('portal.submitSuccess') : t('portal.createSuccess'))
    goMine()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitting.value = false
  }
}

onMounted(() => void load())
</script>

<style scoped>
.publish-page {
  max-width: 880px;
  margin: 0 auto;
}

.publish-head {
  margin-bottom: 20px;
}

.publish-head h1 {
  margin: 0 0 6px;
  font-size: 24px;
}

.publish-head p {
  margin: 0;
  font-size: 13px;
  color: var(--ink-3);
}

.publish-card {
  padding: 28px;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.publish-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.publish-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

@media (max-width: 640px) {
  .publish-row {
    grid-template-columns: 1fr;
  }

  .publish-card {
    padding: 18px;
  }
}
</style>
