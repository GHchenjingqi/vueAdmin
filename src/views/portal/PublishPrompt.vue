<template>
  <div class="publish-page">
    <div class="publish-head">
      <h1>{{ isEdit ? t('portal.editTitle') : t('portal.publishTitle') }}</h1>
      <p>{{ t('portal.submitHint') }}</p>
    </div>

    <div v-loading="loading" class="publish-card">
      <el-form label-position="top" @submit.prevent>
        <div class="publish-layout">
          <div class="publish-left">
            <el-form-item :label="t('prompt.parentPrompt')">
              <el-select
                v-model="form.parentId"
                filterable
                remote
                clearable
                :remote-method="searchParentOptions"
                :loading="parentLoading"
                :placeholder="t('prompt.parentPlaceholder')"
                style="width: 100%"
                @focus="searchParentOptions()"
              >
                <el-option v-for="item in parentOptions" :key="item.id" :label="`#${item.id} ${item.title}`" :value="item.id" />
              </el-select>
              <p class="type-tip">{{ t('prompt.parentTip') }}</p>
            </el-form-item>

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
                <div class="model-derived">
                  <template v-if="derivedModelNames.length">
                    <el-tag v-for="name in derivedModelNames" :key="name" size="small" type="primary" effect="light">{{ name }}</el-tag>
                  </template>
                  <span v-else class="model-derived-empty">{{ t('portal.modelFromPlatforms') }}</span>
                </div>
              </el-form-item>
            </div>

            <el-form-item :label="t('portal.content')" required>
              <el-input v-model="form.content" type="textarea" :rows="8" :placeholder="t('portal.contentPlaceholder')" />
            </el-form-item>
          </div>

          <div class="publish-right">
            <el-form-item :label="t('portal.contentType')" required>
              <el-radio-group v-model="form.type">
                <el-radio-button value="single">{{ t('portal.typeSingle') }}</el-radio-button>
                <el-radio-button value="sequence">{{ t('portal.typeSequence') }}</el-radio-button>
                <el-radio-button value="character-pose">{{ t('portal.typeCharacterPose') }}</el-radio-button>
              </el-radio-group>
              <p class="type-tip">{{ contentTypeTip }}</p>
            </el-form-item>
            <SequenceStepEditor
              v-if="form.type === 'sequence'"
              :steps="form.steps"
              :character-anchor="form.characterAnchor"
              :platforms="platforms"
              @update:steps="form.steps = $event"
              @update:character-anchor="form.characterAnchor = $event"
            />
            <CharacterPoseEditor v-else-if="form.type === 'character-pose'" v-model="form.characterPose" :platforms="platforms" source="portal" />
            <PlatformImageGroups v-else v-model="form.platformGroups" :platforms="platforms" :title="t('portal.images')" layout="tabs" />
          </div>
        </div>

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
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { portalApi, type PortalCategory, type PortalParentOption, type PortalPayload } from '@/api'
import type { PromptCharacterPose, PromptCharacterPoseInput, PromptImageGroupInput, PromptPlatform, PromptStepInput, PromptType } from '@/api/prompt'
import { useUserStore } from '@/stores'
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'
import { deriveModelNames, joinModelNames } from '@/utils/modelNames'
import PlatformImageGroups from './components/PlatformImageGroups.vue'
import SequenceStepEditor from './components/SequenceStepEditor.vue'
import CharacterPoseEditor from './components/CharacterPoseEditor.vue'

interface PublishForm {
  title: string
  content: string
  categoryId: number | ''
  parentId: number | null
  modelName: string
  type: PromptType
  characterAnchor: string
  steps: PromptStepInput[]
  platformGroups: PromptImageGroupInput[]
  characterPose: PromptCharacterPoseInput
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const categories = ref<PortalCategory[]>([])
const platforms = ref<PromptPlatform[]>([])
const parentOptions = ref<PortalParentOption[]>([])
const parentLoading = ref(false)
const form = reactive<PublishForm>({
  title: '',
  content: '',
  categoryId: '',
  parentId: null,
  modelName: '',
  type: 'single',
  characterAnchor: '',
  steps: [],
  platformGroups: [],
  characterPose: { characterImage: null, poses: [] },
})
const loading = ref(false)
const submitting = ref(false)
const editId = computed(() => Number(route.params.id) || 0)
const isEdit = computed(() => editId.value > 0)

/** 左侧模型 = 右侧效果图平台组的平台名集合（套组取所有步骤的平台组），实时联动 */
const contentTypeTip = computed(() => {
  if (form.type === 'sequence') return t('portal.typeSequenceTip')
  if (form.type === 'character-pose') return t('portal.typeCharacterPoseTip')
  return t('portal.typeSingleTip')
})

const derivedModelNames = computed(() => {
  if (form.type === 'sequence')
    return deriveModelNames(
      form.steps.flatMap((step) => step.platformGroups),
      platforms.value,
    )
  if (form.type === 'character-pose')
    return deriveModelNames(
      form.characterPose.poses.flatMap((pose) => pose.platformGroups),
      platforms.value,
    )
  return deriveModelNames(form.platformGroups, platforms.value)
})
watch(
  derivedModelNames,
  (names) => {
    form.modelName = joinModelNames(names)
  },
  { immediate: true },
)

const toFormCharacterPose = (value: PromptCharacterPose | null | undefined): PromptCharacterPoseInput => ({
  characterImage: value?.characterImage
    ? {
        url: value.characterImage.url,
        filePath: value.characterImage.filePath ?? null,
        sort: value.characterImage.sort ?? 0,
        isCover: false,
      }
    : null,
  poses: (value?.poses || []).map((pose) => ({
    key: pose.key,
    poseImage: {
      url: pose.poseImage.url,
      filePath: pose.poseImage.filePath ?? null,
      sort: pose.poseImage.sort ?? 0,
      isCover: false,
    },
    platformGroups: pose.platformGroups.map((group) => ({
      platformId: group.platformId,
      images: group.images.map((image) => ({
        url: image.url,
        filePath: image.filePath ?? null,
        sort: image.sort,
        isCover: Boolean(image.isCover),
      })),
    })),
  })),
})

const goMine = (): void => {
  void router.push('/portal/mine')
}

/** 远程搜索可关联的已发布提示词；编辑时排除自身，避免自关联 */
const searchParentOptions = async (keyword = ''): Promise<void> => {
  parentLoading.value = true
  try {
    const res = await portalApi.getParentOptions({
      keyword: keyword.trim(),
      excludeId: isEdit.value ? editId.value : undefined,
    })
    parentOptions.value = res.data
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    parentLoading.value = false
  }
}

const load = async (): Promise<void> => {
  if (!userStore.isLoggedIn) {
    ElMessage.warning(t('portal.loginRequired'))
    void router.push({ path: '/portal/login', query: { redirect: route.fullPath } })
    return
  }
  loading.value = true
  let parentTitleToRestore = ''
  try {
    const [categoryRes, platformRes] = await Promise.allSettled([portalApi.getCategories(), portalApi.getPlatforms()])
    if (categoryRes.status === 'fulfilled') categories.value = categoryRes.value.data
    else ElMessage.error(getErrorMessage(categoryRes.reason))
    if (platformRes.status === 'fulfilled') platforms.value = platformRes.value.data
    else ElMessage.error(getErrorMessage(platformRes.reason))
    if (isEdit.value) {
      const res = await portalApi.getMinePrompt(editId.value)
      form.title = res.data.title
      form.content = res.data.content
      form.categoryId = res.data.categoryId
      form.parentId = res.data.parentId ?? null
      parentTitleToRestore = res.data.parentTitle ?? ''
      // 模型不再取存档值，统一由右侧效果图平台组派生（见 derivedModelNames watch）
      form.type = res.data.type === 'sequence' || res.data.type === 'character-pose' ? res.data.type : 'single'
      form.characterAnchor = res.data.characterAnchor || ''
      form.characterPose = toFormCharacterPose(res.data.characterPose)
      if (form.type === 'sequence') {
        form.steps = (res.data.steps || []).map((step) => ({
          id: step.id,
          stepOrder: step.stepOrder,
          name: step.name,
          actionPrompt: step.actionPrompt,
          camera: step.camera,
          seconds: step.seconds,
          transition: step.transition,
          platformGroups: step.platformGroups.map((group) => ({
            platformId: group.platformId,
            images: group.images.map((image) => ({
              url: image.url,
              filePath: image.filePath ?? null,
              sort: image.sort,
              isCover: Boolean(image.isCover),
            })),
          })),
        }))
      }
      const groups = res.data.platformGroups?.length
        ? res.data.platformGroups
        : res.data.images?.length
          ? [{ platformId: res.data.images[0].platformId || platforms.value[0]?.id || 1, images: res.data.images, coverImage: '' }]
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
    } else if (platforms.value.length) {
      form.platformGroups = [{ platformId: platforms.value[0].id, images: [] }]
      form.steps = [
        { name: '', actionPrompt: '', camera: null, seconds: 5, transition: null, platformGroups: [{ platformId: platforms.value[0].id, images: [] }] },
      ]
    }
    // 关联选项在回显后加载：编辑时排除自身；若原关联项不在默认列表里则补上，保证回显可读
    await searchParentOptions()
    if (form.parentId && parentTitleToRestore && !parentOptions.value.some((item) => item.id === form.parentId)) {
      parentOptions.value.unshift({ id: form.parentId, title: parentTitleToRestore })
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
  const isSequence = form.type === 'sequence'
  const isCharacterPose = form.type === 'character-pose'
  if (isCharacterPose) {
    if (!form.characterPose.characterImage?.url) {
      ElMessage.warning(t('portal.characterRequired'))
      return
    }
    if (!form.characterPose.poses.length) {
      ElMessage.warning(t('portal.poseRequired'))
      return
    }
    for (const [index, pose] of form.characterPose.poses.entries()) {
      if (!pose.poseImage?.url) {
        ElMessage.warning(t('portal.poseImageRequired').replace('{n}', String(index + 1)))
        return
      }
      if (submit && !pose.platformGroups.some((group) => group.images.length > 0)) {
        ElMessage.warning(t('portal.generatedRequired').replace('{n}', String(index + 1)))
        return
      }
    }
  } else if (isSequence) {
    if (form.steps.length === 0) {
      ElMessage.warning(t('portal.stepRequired'))
      return
    }
    for (const [index, step] of form.steps.entries()) {
      if (!step.name.trim() || !step.actionPrompt.trim()) {
        ElMessage.warning(t('portal.stepFieldRequired').replace('{n}', String(index + 1)))
        return
      }
      if (step.platformGroups.some((group) => group.images.length > 1)) {
        ElMessage.warning(t('portal.stepImageLimit'))
        return
      }
      if (new Set(step.platformGroups.map((group) => group.platformId)).size !== step.platformGroups.length) {
        ElMessage.warning(t('portal.platformDuplicate'))
        return
      }
    }
    const sequenceImages = form.steps.reduce((sum, step) => sum + step.platformGroups.reduce((s, group) => s + group.images.length, 0), 0)
    if (submit && sequenceImages === 0) {
      ElMessage.warning(t('portal.imageRequired'))
      return
    }
  } else {
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
  }

  const payload: PortalPayload = {
    title: form.title.trim(),
    content: form.content.trim(),
    categoryId: Number(form.categoryId),
    parentId: form.parentId,
    modelName: form.modelName.trim(),
    type: form.type,
    characterAnchor: isSequence ? form.characterAnchor.trim() : null,
    characterPose: isCharacterPose
      ? {
          characterImage: form.characterPose.characterImage,
          poses: form.characterPose.poses.map((pose) => ({
            key: pose.key,
            poseImage: pose.poseImage,
            platformGroups: pose.platformGroups
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
          })),
        }
      : undefined,
    steps: isSequence
      ? form.steps.map((step, index) => ({
          ...(step.id ? { id: step.id } : {}),
          stepOrder: index + 1,
          name: step.name.trim(),
          actionPrompt: step.actionPrompt.trim(),
          camera: step.camera?.trim() || null,
          seconds: step.seconds,
          transition: step.transition?.trim() || null,
          platformGroups: step.platformGroups
            .filter((group) => group.images.length > 0)
            .map((group) => ({
              platformId: Number(group.platformId),
              images: group.images.map((image) => ({
                url: image.url,
                filePath: image.filePath ?? null,
                sort: image.sort,
                isCover: Boolean(image.isCover),
              })),
            })),
        }))
      : undefined,
    submit,
    platformGroups:
      isSequence || isCharacterPose
        ? undefined
        : form.platformGroups
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
  width: min(1680px, calc(100% - 48px));
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

.type-tip {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-3);
}

.publish-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
}
.publish-left {
  min-width: 0;
}
.publish-right {
  min-width: 0;
  padding-left: 24px;
  border-left: 1px solid var(--line);
}
.publish-images-title {
  font-weight: 600;
  margin-bottom: 8px;
}
.publish-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.model-derived {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--page-bg);
}
.model-derived-empty {
  color: var(--ink-3);
  font-size: 13px;
}

.publish-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

@media (max-width: 980px) {
  .publish-layout {
    grid-template-columns: 1fr;
  }
  .publish-right {
    padding-left: 0;
    padding-top: 18px;
    border-left: none;
    border-top: 1px solid var(--line);
  }
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
