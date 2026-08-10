export interface KnowledgeCategory {
  id: number
  name: string
  parentId: number
  sort: number
  status: number
  createdAt?: string
  updatedAt?: string
  children?: KnowledgeCategory[]
}

export interface KnowledgeTag {
  id: number
  name: string
  color: string
  createdAt?: string
  updatedAt?: string
}

export interface KnowledgeContent {
  id: number
  title: string
  summary: string
  body: string
  cover?: string
  categoryId: number
  categoryName?: string
  tags?: KnowledgeTag[]
  tagIds?: number[]
  author: string
  status: 'draft' | 'published'
  publishTime?: string
  viewCount: number
  createdAt?: string
  updatedAt?: string
}
