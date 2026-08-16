import { Category, TransactionType } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { api } from '../api/client'

// 说明：预设分类的初始化与去重已移至后端 POST /api/bootstrap

export const categoryRepo = {
  async getAll(): Promise<Category[]> {
    return api<Category[]>('/categories')
  },

  async getByType(type: TransactionType): Promise<Category[]> {
    const all = await this.getAll()
    return all.filter(c => c.type === type)
  },

  async getById(id: string): Promise<Category | undefined> {
    try {
      return await api<Category>(`/categories/${id}`)
    } catch {
      return undefined
    }
  },

  async create(data: Omit<Category, 'id'>): Promise<string> {
    const id = uuidv4()
    await api('/categories', { method: 'POST', body: { ...data, id } })
    return id
  },

  async update(id: string, data: Partial<Category>): Promise<void> {
    await api(`/categories/${id}`, { method: 'PUT', body: data })
  },

  async delete(id: string): Promise<void> {
    await api(`/categories/${id}`, { method: 'DELETE' })
  },

  /** 获取默认"未分类"分类 ID */
  async getDefaultId(type: TransactionType): Promise<string | undefined> {
    const all = await this.getAll()
    return all.find(c => c.type === type && c.name === '未分类')?.id
  },
}
