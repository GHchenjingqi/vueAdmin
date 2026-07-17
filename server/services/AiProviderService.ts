/**
 * AI 提供商管理服务
 *
 * 职责：管理 AI API 提供商的增删改查
 */

import AiProvider from '../models/AiProvider.js'
import { Op } from 'sequelize'
import type { CreateAiProviderInput, UpdateAiProviderInput, AiProviderQueryInput } from '../shared/schemas/aiProvider.js'

// 可公开的字段列表（隐藏 apiKey）
const PUBLIC_FIELDS = ['id', 'name', 'apiBaseUrl', 'models', 'defaultModel', 'enabled', 'sort', 'description', 'createdAt', 'updatedAt']

/**
 * 获取 AI 提供商列表
 */
export async function getList(query: AiProviderQueryInput = {}) {
  const where: any = {}

  if (query.enabled !== undefined) {
    where.enabled = query.enabled
  }

  if (query.keyword) {
    where[Op.or] = [
      { name: { [Op.like]: `%${query.keyword}%` } },
      { description: { [Op.like]: `%${query.keyword}%` } },
    ]
  }

  const providers = await AiProvider.findAll({
    where,
    order: [['sort', 'ASC'], ['createdAt', 'DESC']],
  })

  // 过滤敏感字段
  return providers.map(p => {
    const data: Record<string, any> = {}
    PUBLIC_FIELDS.forEach(f => { data[f] = (p as any)[f] })
    data.hasApiKey = true
    return data
  })
}

/**
 * 获取启用的 AI 提供商列表（前端下拉选择用）
 */
export async function getEnabledList() {
  const providers = await AiProvider.findAll({
    where: { enabled: 1 },
    order: [['sort', 'ASC'], ['createdAt', 'DESC']],
    attributes: PUBLIC_FIELDS,
  })
  return providers
}

/**
 * 获取单个 AI 提供商详情
 */
export async function getById(id: number) {
  const provider = await AiProvider.findByPk(id)
  if (!provider) {
    throw new Error('AI 提供商不存在')
  }
  const data: Record<string, any> = {}
  PUBLIC_FIELDS.forEach(f => { data[f] = (provider as any)[f] })
  data.hasApiKey = true
  return data
}

/**
 * 创建 AI 提供商
 */
export async function create(data: CreateAiProviderInput) {
  const existing = await AiProvider.findOne({ where: { name: data.name } })
  if (existing) {
    throw new Error(`AI 提供商「${data.name}」已存在`)
  }

  const provider = await AiProvider.create({
    name: data.name,
    apiBaseUrl: data.apiBaseUrl,
    apiKey: data.apiKey,
    models: data.models,
    defaultModel: data.defaultModel,
    enabled: data.enabled ?? 1,
    sort: data.sort ?? 0,
    description: data.description ?? null,
  })

  return getById(provider.id)
}

/**
 * 更新 AI 提供商
 */
export async function update(id: number, data: UpdateAiProviderInput) {
  const provider = await AiProvider.findByPk(id)
  if (!provider) {
    throw new Error('AI 提供商不存在')
  }

  // 检查名称唯一性
  if (data.name && data.name !== provider.name) {
    const existing = await AiProvider.findOne({ where: { name: data.name } })
    if (existing) {
      throw new Error(`AI 提供商「${data.name}」已存在`)
    }
  }

  const updateData: Record<string, any> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.apiBaseUrl !== undefined) updateData.apiBaseUrl = data.apiBaseUrl
  if (data.apiKey !== undefined && data.apiKey !== '') updateData.apiKey = data.apiKey
  if (data.models !== undefined) updateData.models = data.models
  if (data.defaultModel !== undefined) updateData.defaultModel = data.defaultModel
  if (data.enabled !== undefined) updateData.enabled = data.enabled
  if (data.sort !== undefined) updateData.sort = data.sort
  if (data.description !== undefined) updateData.description = data.description

  await provider.update(updateData)

  return getById(id)
}

/**
 * 删除 AI 提供商
 */
export async function remove(id: number) {
  const provider = await AiProvider.findByPk(id)
  if (!provider) {
    throw new Error('AI 提供商不存在')
  }

  await provider.destroy()
  return { id }
}

/**
 * 获取完整的提供商配置（含 apiKey，仅服务端内部使用）
 */
export async function getFullConfig(id: number) {
  const provider = await AiProvider.findByPk(id)
  if (!provider) {
    throw new Error('AI 提供商不存在')
  }
  return provider
}

/**
 * 获取默认启用的提供商（按 sort 排序取第一个）
 */
export async function getDefaultProvider() {
  const provider = await AiProvider.findOne({
    where: { enabled: 1 },
    order: [['sort', 'ASC'], ['createdAt', 'DESC']],
  })
  return provider
}

export default {
  getList,
  getEnabledList,
  getById,
  create,
  update,
  remove,
  getFullConfig,
  getDefaultProvider,
}