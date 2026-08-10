<template>
  <div class="ai-assistant">
    <!-- 浮动触发按钮 -->
    <div class="ai-fab" :class="{ active: isOpen }" @click="toggleDrawer">
      <div class="ai-fab-inner">
        <svg viewBox="0 0 24 24" fill="none" class="ai-fab-icon">
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" fill="currentColor" opacity="0.2" />
          <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
          <circle cx="15.5" cy="10" r="1.5" fill="currentColor" />
          <path d="M8 14.5c.828.667 2.333 1.5 4 1.5s3.172-.833 4-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </div>
      <span v-if="loading" class="ai-fab-dot" />
    </div>

    <!-- 抽屉式对话界面 -->
    <el-drawer v-model="isOpen" :size="540" direction="rtl" :with-header="false" :close-on-click-modal="true" class="ai-drawer">
      <div class="ai-drawer-body">
        <!-- 头部 -->
        <div class="ai-header">
          <div class="ai-header-left">
            <div class="ai-header-icon">
              <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" fill="currentColor" opacity="0.2" />
                <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
                <circle cx="15.5" cy="10" r="1.5" fill="currentColor" />
                <path d="M8 14.5c.828.667 2.333 1.5 4 1.5s3.172-.833 4-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </div>
            <div>
              <div class="ai-header-title">
                {{ t('ai.headerTitle') }}
              </div>
              <div class="ai-header-subtitle">
                {{ t('ai.headerSubtitle') }}
              </div>
            </div>
          </div>
          <div class="ai-header-right">
            <el-tag :type="apiStatus.apiConfigured ? 'success' : 'danger'" size="small" effect="light">
              <el-icon :size="12">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="6" fill="currentColor" /></svg>
              </el-icon>
              {{ apiStatus.apiConfigured ? t('ai.connected') : t('ai.notConfigured') }}
            </el-tag>
            <el-button size="small" text :icon="Close" class="ai-close-btn" @click="isOpen = false" />
          </div>
        </div>

        <!-- 消息列表 -->
        <div ref="messageListRef" class="ai-messages">
          <!-- 空状态 -->
          <div v-if="messages.length === 0" class="ai-empty">
            <div class="ai-empty-illustration">
              <svg viewBox="0 0 120 100" fill="none" class="ai-empty-svg">
                <rect x="10" y="20" width="100" height="60" rx="12" stroke="currentColor" stroke-width="1.5" opacity="0.15" />
                <circle cx="35" cy="45" r="4" fill="currentColor" opacity="0.3" />
                <circle cx="50" cy="45" r="4" fill="currentColor" opacity="0.3" />
                <circle cx="65" cy="45" r="4" fill="currentColor" opacity="0.3" />
                <path d="M30 60c5 4 12 6 20 6s15-2 20-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3" />
                <path d="M85 45l10-5M85 50l10 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.2" />
              </svg>
            </div>
            <h4 class="ai-empty-title">
              {{ t('ai.emptyTitle') }}
            </h4>
            <p class="ai-empty-desc">
              {{ t('ai.emptyDesc') }}
            </p>
            <div class="ai-empty-hints">
              <el-button v-for="hint in quickHints" :key="hint" size="small" round plain :disabled="loading" @click="sendMessage(hint)">
                {{ hint }}
              </el-button>
            </div>
          </div>

          <!-- 消息 -->
          <template v-for="(msg, idx) in messages" :key="idx">
            <div class="ai-message" :class="msg.role">
              <div class="ai-message-avatar" :class="msg.role">
                <svg v-if="msg.role === 'user'" viewBox="0 0 24 24" fill="none" width="16" height="16">
                  <circle cx="12" cy="8" r="4" fill="currentColor" />
                  <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.5" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" width="16" height="16">
                  <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
                  <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
                  <circle cx="15.5" cy="10" r="1.5" fill="currentColor" />
                  <path d="M8 14.5c.828.667 2.333 1.5 4 1.5s3.172-.833 4-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                </svg>
              </div>
              <div class="ai-message-body">
                <!-- 用户消息 -->
                <div v-if="msg.role === 'user'" class="ai-bubble user-bubble">
                  {{ msg.content }}
                </div>

                <!-- AI 回复 -->
                <template v-else>
                  <div v-if="msg.explanation" class="ai-explanation markdown-body">
                    <!-- eslint-disable vue/no-v-html -->
                    <div v-html="renderMarkdown(msg.explanation)" />
                    <!-- eslint-enable vue/no-v-html -->
                  </div>

                  <div v-if="msg.files && msg.files.length > 0" class="ai-files-section">
                    <div class="ai-files-header">
                      <div class="ai-files-header-left">
                        <el-icon :size="16">
                          <FolderOpened />
                        </el-icon>
                        <span>{{ t('ai.generatedFiles', { count: msg.files.length }) }}</span>
                      </div>
                      <el-button type="primary" size="small" plain :loading="applyingAll" :disabled="applyingAll" @click="applyAllFiles(msg.files)">
                        <el-icon :size="14" style="margin-right: 4px">
                          <Upload />
                        </el-icon>
                        {{ t('ai.applyAll') }}
                      </el-button>
                    </div>

                    <div class="ai-files-list">
                      <div
                        v-for="file in msg.files"
                        :key="file.path"
                        class="ai-file-item"
                        :class="{ expanded: activeFilePath === file.path }"
                        @click="activeFilePath = activeFilePath === file.path ? '' : file.path"
                      >
                        <div class="ai-file-item-header">
                          <el-tag :type="file.isNew ? 'success' : 'warning'" size="small" effect="plain" class="file-tag">
                            {{ file.isNew ? t('ai.fileNew') : t('ai.fileModified') }}
                          </el-tag>
                          <span class="ai-file-path">{{ file.path }}</span>
                          <el-tag size="small" effect="plain" class="ai-file-lang-tag">
                            {{ file.language }}
                          </el-tag>
                          <el-icon class="ai-file-expand-icon" :class="{ rotated: activeFilePath === file.path }">
                            <ArrowDown />
                          </el-icon>
                        </div>
                        <div v-show="activeFilePath === file.path" class="ai-file-item-body">
                          <div v-if="file.description" class="ai-file-desc">
                            {{ file.description }}
                          </div>
                          <div class="ai-file-actions">
                            <el-button size="small" text :icon="CopyDocument" @click.stop="copyCode(file.content)">
                              {{ t('ai.copy') }}
                            </el-button>
                            <el-button
                              size="small"
                              text
                              type="primary"
                              :icon="Upload"
                              :loading="applyingFile === file.path"
                              @click.stop="applySingleFile(file)"
                            >
                              {{ t('ai.applyFile') }}
                            </el-button>
                          </div>
                          <div class="ai-code-viewer">
                            <!-- eslint-disable vue/no-v-html -->
                            <pre><code
                            :class="`language-${file.language || 'text'}`"
                            v-html="highlightCode(file.content, file.language)"
                            /></pre>
                            <!-- eslint-enable vue/no-v-html -->
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-if="msg.usage" class="ai-usage">
                    <el-icon :size="12">
                      <DataAnalysis />
                    </el-icon>
                    Tokens: {{ msg.usage.totalTokens }} | 提示: {{ msg.usage.promptTokens }} | 补全: {{ msg.usage.completionTokens }}
                  </div>
                </template>
              </div>
            </div>
          </template>

          <!-- 加载状态 -->
          <div v-if="loading" class="ai-message assistant">
            <div class="ai-message-avatar assistant">
              <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
                <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
                <circle cx="15.5" cy="10" r="1.5" fill="currentColor" />
                <path d="M8 14.5c.828.667 2.333 1.5 4 1.5s3.172-.833 4-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </div>
            <div class="ai-loading">
              <div class="ai-loading-bar" />
              <span>{{ t('ai.thinking') }}</span>
            </div>
          </div>
        </div>

        <!-- 底部输入区域 -->
        <div class="ai-footer">
          <div class="ai-input-wrapper">
            <div class="ai-input-container">
              <textarea
                ref="textareaRef"
                v-model="inputText"
                class="ai-textarea"
                :disabled="loading"
                :placeholder="t('ai.placeholder')"
                rows="3"
                @input="autoResize"
                @keydown="handleKeydown"
              />
              <div class="ai-input-actions">
                <el-tooltip :content="t('ai.send')" placement="top">
                  <button class="ai-send-btn" :class="{ active: inputText.trim() && !loading }" :disabled="!inputText.trim() || loading" @click="sendMessage()">
                    <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                      <path d="M3 12L21 3l-5 9 5 9-18-9z" fill="currentColor" />
                    </svg>
                  </button>
                </el-tooltip>
              </div>
            </div>
            <div class="ai-input-hint">
              <div class="ai-hint-left">
                <span>{{ t('ai.shortcutHint') }}</span>
              </div>
              <div class="ai-hint-right">
                <!-- 模型/提供商切换 -->
                <el-dropdown v-if="enabledProviders.length > 0" trigger="click" @command="handleDropdownCommand">
                  <el-button text size="small" type="info" :icon="ArrowDown" class="ai-model-btn">
                    {{ currentModel || t('ai.selectModel') }}
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item :disabled="true" class="ai-dropdown-provider-label">
                        {{ t('ai.providerModel', { name: selectedProviderName }) }}
                      </el-dropdown-item>
                      <el-dropdown-item v-for="m in currentModels" :key="m" :command="'model:' + m" :class="{ active: currentModel === m }">
                        {{ m }}
                      </el-dropdown-item>
                      <el-dropdown-item divided :disabled="true" class="ai-dropdown-provider-label">
                        {{ t('ai.switchProvider') }}
                      </el-dropdown-item>
                      <el-dropdown-item
                        v-for="p in enabledProviders"
                        :key="'p-' + p.id"
                        :command="'provider:' + p.id"
                        :class="{ active: currentProviderId === p.id }"
                      >
                        {{ p.name }}
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-button v-if="!apiStatus.apiConfigured" text size="small" type="warning" :icon="Setting" @click="showProviderManager = true">
                  {{ t('ai.configureApi') }}
                </el-button>
                <el-button v-else text size="small" type="info" :icon="Setting" @click="showProviderManager = true">
                  {{ t('ai.manageProvider') }}
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- AI 提供商管理弹窗（内嵌在抽屉中） -->
    <el-dialog
      v-model="showProviderManager"
      :title="t('ai.providerDialogTitle')"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
      append-to-body
      class="ai-provider-dialog"
    >
      <div v-if="allProviders.length === 0 && !providerFormVisible" class="provider-empty">
        <el-empty :description="t('ai.noProvider')">
          <el-button type="primary" :icon="Plus" @click="openAddProvider">
            {{ t('ai.addProvider') }}
          </el-button>
        </el-empty>
      </div>

      <template v-else>
        <!-- 提供商列表 -->
        <div v-show="!providerFormVisible" class="provider-list-wrap">
          <div class="provider-list-toolbar">
            <el-button size="small" type="primary" :icon="Plus" @click="openAddProvider">
              {{ t('ai.add') }}
            </el-button>
          </div>
          <div class="provider-list">
            <div v-for="p in allProviders" :key="p.id" class="provider-card-item">
              <div class="provider-card-left">
                <div class="provider-card-name">
                  {{ p.name }}
                </div>
                <div class="provider-card-url">
                  {{ p.apiBaseUrl }}
                </div>
                <div class="provider-card-models">
                  <el-tag v-for="m in p.models.split(',')" :key="m" size="small" effect="plain" class="provider-card-model-tag">
                    {{ m.trim() }}
                  </el-tag>
                </div>
              </div>
              <div class="provider-card-right">
                <div class="provider-switch-wrap" @click="toggleProviderEnabled(p, p.enabled !== 1)">
                  <el-switch :model-value="p.enabled === 1" size="small" :loading="switchingId === p.id" class="provider-switch" />
                </div>
                <el-button size="small" text :icon="Edit" @click="openEditProvider(p)" />
                <el-popconfirm
                  :title="t('ai.deleteConfirm')"
                  :confirm-button-text="t('ai.delete')"
                  :cancel-button-text="t('ai.cancel')"
                  @confirm="handleDeleteProvider(p)"
                >
                  <template #reference>
                    <el-button size="small" text type="danger" :icon="Delete" />
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </div>
        </div>

        <!-- 提供商表单 -->
        <div v-show="providerFormVisible" class="provider-form-wrap">
          <el-form ref="providerFormRef" :model="providerForm" :rules="providerRules" label-width="100px" size="small">
            <el-form-item :label="t('ai.providerName')" prop="name">
              <el-input v-model="providerForm.name" :placeholder="t('aiProvider.namePlaceholder')" maxlength="100" />
            </el-form-item>
            <el-form-item :label="t('ai.apiUrl')" prop="apiBaseUrl">
              <el-input v-model="providerForm.apiBaseUrl" :placeholder="t('aiProvider.apiUrlPlaceholder')" maxlength="255" />
            </el-form-item>
            <el-form-item :label="t('ai.apiKey')" prop="apiKey">
              <el-input
                v-model="providerForm.apiKey"
                type="password"
                show-password
                :placeholder="isEditingProvider ? t('ai.leaveEmpty') : t('ai.enterApiKey')"
                maxlength="500"
              />
            </el-form-item>
            <el-form-item :label="t('ai.defaultModel')" prop="defaultModel">
              <el-input v-model="providerForm.defaultModel" :placeholder="t('aiProvider.modelPlaceholder')" maxlength="100" />
            </el-form-item>
            <el-form-item :label="t('ai.availableModels')" prop="models">
              <el-input v-model="providerForm.models" :placeholder="t('ai.modelsPlaceholder')" maxlength="500" />
              <div class="form-tip">
                {{ t('ai.modelsTip') }}
              </div>
            </el-form-item>
          </el-form>
          <div class="provider-form-actions">
            <el-button size="small" @click="providerFormVisible = false">
              {{ t('ai.cancel') }}
            </el-button>
            <el-button size="small" type="primary" :loading="providerSubmitLoading" @click="handleSubmitProvider">
              {{ t('ai.save') }}
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { useI18n } from '@/i18n'
import { Close, CopyDocument, Upload, FolderOpened, ArrowDown, DataAnalysis, Plus, Delete, Edit, Setting } from '@element-plus/icons-vue'
import { marked } from 'marked'
// highlight.js 改为懒加载：AI 生成带代码文件时才按需拉取，避免把高亮库拉入首屏
let hljsModule: typeof import('highlight.js').default | null = null
let hljsPromise: Promise<void> | null = null
const hljsReady = ref(false)

function ensureHljs(): void {
  if (!hljsPromise) {
    hljsPromise = import('highlight.js').then((m) => {
      hljsModule = m.default
      hljsReady.value = true
    })
  }
}

function escapeHtml(code: string): string {
  return code.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
import { aiApi, type GeneratedCodeFile } from '@/api/ai'
import type { AIStatus, AiProvider } from '@/api/ai'
import { AppError } from '@/utils/errors'

const { t } = useI18n()

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  explanation?: string
  files?: GeneratedCodeFile[]
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

const isOpen = ref(false)
const inputText = ref('')
const loading = ref(false)
const applyingAll = ref(false)
const applyingFile = ref<string | null>(null)
const messages = ref<ChatMessage[]>([])
const activeFilePath = ref<string>('')
const messageListRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const currentProviderId = ref<number | undefined>(undefined)
const selectedProviderName = ref('AI')
const currentModel = ref('')
const enabledProviders = ref<AiProvider[]>([])

// 当前选中提供商的模型列表
const currentModels = computed(() => {
  const provider = enabledProviders.value.find((p) => p.id === currentProviderId.value)
  if (!provider) return []
  return provider.models
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
})

const apiStatus = reactive<AIStatus>({
  apiConfigured: false,
  message: '检查中...',
  knowledgeBase: {
    totalFiles: 0,
    categories: {},
    lastUpdated: '',
  },
})

const quickHints = computed(() => [t('ai.generateArticle'), t('ai.generateTag'), t('ai.generateNotice'), t('ai.generateKnowledge')])

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
})

function renderMarkdown(text: string): string {
  try {
    return marked.parse(text) as string
  } catch {
    return text
  }
}

function highlightCode(code: string, language?: string): string {
  // 依赖 hljsReady 触发响应式重渲染（hljs 异步加载完成后重新高亮）
  void hljsReady.value
  const lang = language || 'text'
  if (hljsModule) {
    try {
      if (hljsModule.getLanguage(lang)) {
        return hljsModule.highlight(code, { language: lang }).value
      }
      return hljsModule.highlightAuto(code).value
    } catch {
      return escapeHtml(code)
    }
  }
  // hljs 尚未加载：触发懒加载，先返回转义后的纯文本作为占位
  ensureHljs()
  return escapeHtml(code)
}

function autoResize() {
  const el = textareaRef.value
  if (el) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }
}

function toggleDrawer() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    checkStatus()
    loadProviders()
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  })
}

function handleKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault()
    sendMessage()
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function handleSelectProvider(providerId: number) {
  currentProviderId.value = providerId
  const provider = enabledProviders.value.find((p) => p.id === providerId)
  if (provider) {
    selectedProviderName.value = provider.name
    currentModel.value = provider.defaultModel
  }
}

function handleDropdownCommand(command: string) {
  if (command.startsWith('model:')) {
    const model = command.slice(6)
    currentModel.value = model
  } else if (command.startsWith('provider:')) {
    const providerId = Number(command.slice(9))
    handleSelectProvider(providerId)
  }
}

// ====== 提供商管理弹窗 ======
const showProviderManager = ref(false)
const allProviders = ref<AiProvider[]>([])
const switchingId = ref<number | null>(null)
const providerFormVisible = ref(false)
const isEditingProvider = ref(false)
const editingProviderId = ref<number | null>(null)
const providerSubmitLoading = ref(false)
const providerFormRef = ref<FormInstance | null>(null)

const providerForm = ref({
  name: '',
  apiBaseUrl: '',
  apiKey: '',
  models: '',
  defaultModel: '',
})

const providerRules = {
  name: [{ required: true, message: t('ai.enterProviderName'), trigger: 'blur' }],
  apiBaseUrl: [
    { required: true, message: t('ai.enterApiUrl'), trigger: 'blur' },
    { type: 'url' as const, message: t('ai.enterValidUrl'), trigger: 'blur' },
  ],

  models: [{ required: true, message: t('ai.enterModels'), trigger: 'blur' }],
  defaultModel: [{ required: true, message: t('ai.enterDefaultModel'), trigger: 'blur' }],
}

async function loadAllProviders() {
  try {
    const res = await aiApi.getProviders()
    allProviders.value = res.data || []
  } catch {
    ElMessage.error(t('ai.fetchFailed'))
  }
}

function openAddProvider() {
  isEditingProvider.value = false
  editingProviderId.value = null
  providerForm.value = { name: '', apiBaseUrl: '', apiKey: '', models: '', defaultModel: '' }
  providerFormVisible.value = true
}

async function openEditProvider(p: AiProvider) {
  isEditingProvider.value = true
  editingProviderId.value = p.id
  providerForm.value = {
    name: p.name,
    apiBaseUrl: p.apiBaseUrl,
    apiKey: '',
    models: p.models,
    defaultModel: p.defaultModel,
  }
  providerFormVisible.value = true

  // 异步拉取完整 key
  try {
    const res = await aiApi.getProvider(p.id, true)
    if (res.data?.apiKey) {
      providerForm.value.apiKey = res.data.apiKey
    }
  } catch {
    // 忽略，用户手动填写
  }
}

async function handleSubmitProvider() {
  if (!providerFormRef.value) return
  try {
    await providerFormRef.value.validate()
  } catch {
    return
  }

  // 新增时 apiKey 必填，编辑时可选（留空则不修改）
  if (!isEditingProvider.value && !providerForm.value.apiKey?.trim()) {
    ElMessage.warning(t('ai.enterApiKey'))
    return
  }

  providerSubmitLoading.value = true
  try {
    const data: Record<string, unknown> = { ...providerForm.value }
    // 编辑时 apiKey 为空则删除该字段，后端会保留原值
    if (isEditingProvider.value && !(data.apiKey as string)?.trim()) {
      delete data.apiKey
    }
    if (data.models && !isEditingProvider.value) {
      const modelList = (data.models as string)
        .split(',')
        .map((m: string) => m.trim())
        .filter(Boolean)
      if (!data.defaultModel && modelList.length > 0) {
        data.defaultModel = modelList[0]
      }
    }

    if (isEditingProvider.value && editingProviderId.value) {
      await aiApi.updateProvider(editingProviderId.value, data as Parameters<typeof aiApi.updateProvider>[1])
      ElMessage.success(t('ai.updateSuccess'))
    } else {
      await aiApi.createProvider(data as Parameters<typeof aiApi.createProvider>[0])
      ElMessage.success(t('ai.createSuccess'))
    }
    providerFormVisible.value = false
    await loadAllProviders()
    await loadProviders()
    await checkStatus()
  } catch (err: unknown) {
    ElMessage.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || t('ai.operationFailed'))
  } finally {
    providerSubmitLoading.value = false
  }
}

async function handleDeleteProvider(p: AiProvider) {
  try {
    await aiApi.deleteProvider(p.id)
    ElMessage.success(t('ai.deleteSuccess'))
    await loadAllProviders()
    await loadProviders()
    await checkStatus()
  } catch {
    ElMessage.error(t('ai.deleteFailed'))
  }
}

async function toggleProviderEnabled(p: AiProvider, val: boolean) {
  switchingId.value = p.id
  const newEnabled = val ? 1 : 0
  const isCurrentProvider = currentProviderId.value === p.id
  try {
    // 乐观更新本地状态，开关立即响应
    p.enabled = newEnabled
    await aiApi.updateProvider(p.id, { enabled: newEnabled })
    // 同时刷新全量列表与启用列表，确保上下文中的下拉数据同步
    await loadAllProviders()
    await loadProviders()
    // 如果当前选中的提供商被禁用了，loadProviders 内部会切换到第一个启用的；
    // 如果重新启用当前提供商且之前没有选中项，则自动选中它
    if (isCurrentProvider && val && currentProviderId.value !== p.id) {
      handleSelectProvider(p.id)
    }
    await checkStatus()
  } catch {
    // 失败时回滚
    await loadAllProviders()
    await loadProviders()
    ElMessage.error(t('ai.operationFailed'))
  } finally {
    switchingId.value = null
  }
}

async function loadProviders() {
  try {
    const res = await aiApi.getEnabledProviders()
    enabledProviders.value = res.data || []
    if (enabledProviders.value.length > 0) {
      // 检查当前选中的提供商是否还在启用列表中
      const currentStillEnabled = currentProviderId.value && enabledProviders.value.some((ep) => ep.id === currentProviderId.value)
      if (!currentStillEnabled) {
        handleSelectProvider(enabledProviders.value[0].id)
      }
    } else {
      currentProviderId.value = undefined
      selectedProviderName.value = 'AI'
      currentModel.value = ''
    }
  } catch {
    // 忽略
  }
}

async function checkStatus() {
  try {
    const res = await aiApi.getStatus()
    Object.assign(apiStatus, res.data)
  } catch {
    apiStatus.apiConfigured = false
    apiStatus.message = t('ai.connectionFailed')
  }
}

async function sendMessage(text?: string) {
  const message = (text || inputText.value).trim()
  if (!message || loading.value) return

  messages.value.push({ role: 'user', content: message })
  inputText.value = ''
  loading.value = true
  activeFilePath.value = ''
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
  }
  scrollToBottom()

  try {
    const res = await aiApi.chat({
      message,
      providerId: currentProviderId.value,
      model: currentModel.value,
    })

    if (res.code === 0 && res.data) {
      messages.value.push({
        role: 'assistant',
        content: res.data.explanation || '',
        explanation: res.data.explanation,
        files: res.data.files,
        usage: res.data.usage,
      })

      if (res.data.files && res.data.files.length > 0) {
        activeFilePath.value = res.data.files[0].path
      }
    } else {
      messages.value.push({
        role: 'assistant',
        content: res.message || t('ai.generationFailed'),
      })
    }
  } catch (err: unknown) {
    // 统一提取错误信息，展示在聊天框中
    const errorMsg = extractErrorMessage(err)
    // 诊断：把错误信息同时输出到控制台，方便排查
    console.warn('[AI Chat Error]', err, 'errorMsg:', errorMsg)
    messages.value.push({
      role: 'assistant',
      content: errorMsg,
    })
    ElMessage.error(errorMsg)
  } finally {
    loading.value = false
    scrollToBottom()
  }
}

/** Extract readable error message from any error type */
function extractErrorMessage(err: unknown): string {
  try {
    if (!err) return t('ai.networkError')

    if (typeof err === 'string') return err

    if (err instanceof AppError) {
      return err.code === 'TIMEOUT' ? t('ai.timeout') : err.message || t('ai.networkError')
    }

    if (err instanceof Error) {
      return err.message || t('ai.networkError')
    }

    // Plain object
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message

    return String(err)
  } catch {
    return t('ai.networkError')
  }
}

async function applyAllFiles(files: GeneratedCodeFile[]) {
  if (applyingAll.value) return

  try {
    await ElMessageBox.confirm(t('ai.applyConfirm', { count: files.length }), t('ai.applyConfirmTitle'), {
      confirmButtonText: t('ai.confirm'),
      cancelButtonText: t('ai.cancel'),
      type: 'warning',
    })
  } catch {
    return
  }

  applyingAll.value = true
  try {
    const res = await aiApi.apply(files)
    if (res.code === 0) {
      const data = res.data
      let message = data?.message || t('ai.applySuccess')
      if (data.createdMenuIds?.length > 0) {
        message += t('ai.createdMenus', { count: data.createdMenuIds.length })
      }
      ElMessage.success(message)
    } else {
      ElMessage.error(res.message || t('ai.applyFailed'))
    }
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } }; message?: string }
    ElMessage.error(error?.response?.data?.message || t('ai.applyFailed'))
  } finally {
    applyingAll.value = false
  }
}

async function applySingleFile(file: GeneratedCodeFile) {
  applyingFile.value = file.path
  try {
    const res = await aiApi.apply([file])
    if (res.code === 0) {
      ElMessage.success(t('ai.applyFileSuccess', { path: file.path }))
    } else {
      ElMessage.error(res.message || t('ai.applyFailed'))
    }
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } }; message?: string }
    ElMessage.error(error?.response?.data?.message || t('ai.applyFailed'))
  } finally {
    applyingFile.value = null
  }
}

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    ElMessage.success(t('ai.copySuccess'))
  } catch {
    ElMessage.error(t('ai.copyFailed'))
  }
}

watch(isOpen, (val) => {
  if (val) {
    scrollToBottom()
  }
})

watch(showProviderManager, (val) => {
  if (val) {
    providerFormVisible.value = false
    loadAllProviders()
  } else {
    // 关闭弹窗后重新加载并刷新状态
    loadProviders()
    checkStatus()
  }
})

onMounted(() => {
  checkStatus()
  loadProviders()
})
</script>

<style scoped lang="scss">
.ai-assistant {
  position: fixed;
  right: 24px;
  bottom: 80px;
  z-index: 2000;
}

// ====== 浮动按钮 ======
.ai-fab {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.35);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;

  &:hover {
    transform: scale(1.1) rotate(-5deg);
    box-shadow: 0 6px 24px rgba(64, 158, 255, 0.45);
  }

  &.active {
    transform: scale(0.95);
    box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
  }

  .ai-fab-inner {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ai-fab-icon {
    width: 26px;
    height: 26px;
  }
}

.ai-fab-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #52c41a;
  border: 2px solid #fff;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

// ====== 抽屉布局 ======
.ai-drawer .el-drawer__body {
  padding: 0;
  overflow: hidden;
  height: 100%;
  background: var(--el-bg-color-page);
}

.ai-drawer-body {
  display: flex;
  flex-direction: column;
  height: 100%;
}

// ====== 头部 ======
.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;

  .ai-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .ai-header-icon {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: linear-gradient(135deg, var(--el-color-primary-light-9), var(--el-color-primary-light-7));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--el-color-primary);
  }

  .ai-header-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    line-height: 1.3;
  }

  .ai-header-subtitle {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
    line-height: 1.3;
  }

  .ai-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ai-provider-tag {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
  }

  .ai-close-btn {
    color: var(--el-text-color-secondary);
    &:hover {
      color: var(--el-text-color-primary);
      background: var(--el-fill-color-light);
    }
  }
}

// ====== 消息列表 ======
.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scroll-behavior: smooth;
}

// ====== 空状态 ======
.ai-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 50px 20px;
  text-align: center;

  .ai-empty-illustration {
    margin-bottom: 20px;
    color: var(--el-color-primary-light-5);

    .ai-empty-svg {
      width: 100px;
      height: 85px;
    }
  }

  .ai-empty-title {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 8px;
    color: var(--el-text-color-primary);
  }

  .ai-empty-desc {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    margin: 0 0 24px;
    max-width: 280px;
    line-height: 1.5;
  }

  .ai-empty-hints {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }
}

// ====== 消息条目 ======
.ai-message {
  display: flex;
  gap: 10px;
  max-width: 100%;

  &.user {
    flex-direction: row-reverse;
  }
}

.ai-message-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.assistant {
    background: linear-gradient(135deg, var(--el-color-primary-light-9), var(--el-color-primary-light-7));
    color: var(--el-color-primary);
  }

  &.user {
    background: var(--el-color-primary);
    color: #fff;
  }
}

.ai-message-body {
  min-width: 0;
  max-width: calc(100% - 44px);
}

// ====== 气泡 ======
.ai-bubble {
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}

.user-bubble {
  background: var(--el-color-primary);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.ai-explanation {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.7;
  border-bottom-left-radius: 4px;

  :deep(p) {
    margin: 0 0 8px;
    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(code) {
    background: var(--el-color-primary-light-9);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
    font-family: 'Cascadia Code', 'Fira Code', monospace;
  }

  :deep(ul),
  :deep(ol) {
    padding-left: 20px;
    margin: 4px 0;
  }
  :deep(li) {
    margin-bottom: 2px;
  }
  :deep(strong) {
    font-weight: 600;
  }
  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4) {
    margin: 12px 0 6px;
  }
  :deep(blockquote) {
    border-left: 3px solid var(--el-color-primary-light-5);
    margin: 8px 0;
    padding: 4px 12px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-lighter);
    border-radius: 0 4px 4px 0;
  }
}

// ====== 文件区域 ======
.ai-files-section {
  margin-top: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
}

.ai-files-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);

  .ai-files-header-left {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
}

.ai-files-list {
  padding: 4px;
}

.ai-file-item {
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--el-fill-color-lighter);
  }

  &.expanded {
    background: var(--el-fill-color-lighter);
    border-color: var(--el-border-color-light);
  }

  .ai-file-item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;

    .file-tag {
      flex-shrink: 0;
    }

    .ai-file-path {
      flex: 1;
      font-size: 12px;
      font-family: 'Cascadia Code', 'Fira Code', 'Courier New', monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--el-text-color-regular);
    }

    .ai-file-lang-tag {
      flex-shrink: 0;
      font-size: 10px;
      padding: 0 6px;
    }

    .ai-file-expand-icon {
      flex-shrink: 0;
      transition: transform 0.2s;
      color: var(--el-text-color-placeholder);

      &.rotated {
        transform: rotate(-180deg);
      }
    }
  }

  .ai-file-item-body {
    padding: 0 12px 12px;
  }

  .ai-file-desc {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-bottom: 8px;
    padding: 6px 8px;
    background: var(--el-bg-color);
    border-radius: 6px;
  }

  .ai-file-actions {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }
}

// ====== 代码预览 ======
.ai-code-viewer {
  background: #1e1e1e;
  border-radius: 8px;
  overflow: auto;
  max-height: 320px;

  pre {
    margin: 0;
    padding: 14px;
    overflow: auto;
    font-size: 12px;
    line-height: 1.6;
  }

  code {
    font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Courier New', monospace;
    color: #d4d4d4;
  }
}

// highlight.js 暗色主题覆盖
.ai-code-viewer {
  :deep(.hljs-keyword) {
    color: #569cd6;
  }
  :deep(.hljs-string) {
    color: #ce9178;
  }
  :deep(.hljs-comment) {
    color: #6a9955;
    font-style: italic;
  }
  :deep(.hljs-number) {
    color: #b5cea8;
  }
  :deep(.hljs-title) {
    color: #dcdcaa;
  }
  :deep(.hljs-type) {
    color: #4ec9b0;
  }
  :deep(.hljs-attr) {
    color: #9cdcfe;
  }
  :deep(.hljs-built_in) {
    color: #4ec9b0;
  }
  :deep(.hljs-literal) {
    color: #569cd6;
  }
  :deep(.hljs-meta) {
    color: #569cd6;
  }
  :deep(.hljs-params) {
    color: #9cdcfe;
  }
  :deep(.hljs-function) {
    color: #dcdcaa;
  }
  :deep(.hljs-variable) {
    color: #9cdcfe;
  }
  :deep(.hljs-property) {
    color: #9cdcfe;
  }
  :deep(.hljs-punctuation) {
    color: #d4d4d4;
  }
}

// ====== 加载 ======
.ai-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  border-bottom-left-radius: 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);

  .ai-loading-bar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid var(--el-color-primary-light-5);
    border-top-color: var(--el-color-primary);
    animation: spin 0.8s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

// ====== Token 用量 ======
.ai-usage {
  margin-top: 8px;
  padding: 4px 10px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

// ====== 底部输入区域 ======
.ai-footer {
  flex-shrink: 0;
  margin-top: auto;
  padding: 12px 16px 16px;
  background: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color-lighter);
}

.ai-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-input-container {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  padding: 6px 6px 6px 14px;
  transition: all 0.2s;

  &:focus-within {
    border-color: var(--el-color-primary);
    background: var(--el-bg-color);
    box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.1);
  }
}

.ai-textarea {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  line-height: 1.5;
  color: var(--el-text-color-primary);
  resize: none;
  padding: 4px 0;
  min-height: 24px;
  max-height: 120px;
  font-family: inherit;

  &::placeholder {
    color: var(--el-text-color-placeholder);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.ai-input-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.ai-send-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: var(--el-fill-color);
  color: var(--el-text-color-placeholder);
  transition: all 0.2s;

  &.active {
    background: var(--el-color-primary);
    color: #fff;

    &:hover {
      background: var(--el-color-primary-light-3);
      transform: scale(1.05);
    }
  }

  &:disabled {
    cursor: not-allowed;
  }
}

.ai-input-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.ai-hint-left {
  display: flex;
  align-items: center;
}

.ai-hint-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ai-model-btn {
  font-size: 11px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-dropdown-provider-label {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  cursor: default;
  opacity: 0.7;
}
</style>

<!-- AI 提供商弹窗样式（全局，因 append-to-body） -->
<style lang="scss">
.ai-provider-dialog {
  .el-dialog__body {
    padding: 16px 20px;
    max-height: 460px;
    overflow-y: auto;
  }

  .provider-empty {
    padding: 20px 0;
  }

  .provider-list-wrap {
    .provider-list-toolbar {
      margin-bottom: 12px;
    }

    .provider-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .provider-card-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border: 1px solid var(--el-border-color-light);
      border-radius: 8px;
      background: var(--el-bg-color);
      transition: all 0.2s;

      &:hover {
        border-color: var(--el-color-primary-light-5);
        background: var(--el-color-primary-light-9);
      }

      .provider-card-left {
        min-width: 0;
        flex: 1;

        .provider-card-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--el-text-color-primary);
          margin-bottom: 2px;
        }

        .provider-card-url {
          font-size: 11px;
          font-family: monospace;
          color: var(--el-text-color-secondary);
          margin-bottom: 6px;
          word-break: break-all;
        }

        .provider-card-models {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;

          .provider-card-model-tag {
            font-size: 10px;
            font-family: monospace;
            padding: 0 6px;
            height: 20px;
            line-height: 20px;
          }
        }
      }

      .provider-card-right {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: 12px;
        flex-shrink: 0;
      }

      .provider-switch-wrap {
        cursor: pointer;
        display: inline-flex;
        align-items: center;
      }

      .provider-switch {
        pointer-events: none;
      }
    }
  }

  .provider-form-wrap {
    .form-tip {
      font-size: 12px;
      color: var(--el-text-color-placeholder);
      margin-top: 2px;
      line-height: 1.4;
    }

    .provider-form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--el-border-color-lighter);
    }
  }
}
</style>
