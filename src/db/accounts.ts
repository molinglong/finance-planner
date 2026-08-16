import { Account } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { api } from '../api/client'

// 说明：预设账户的初始化、合并与清理已移至后端 POST /api/bootstrap

export const accountRepo = {
  async getAll(): Promise<Account[]> {
    return api<Account[]>('/accounts')
  },

  async getById(id: string): Promise<Account | undefined> {
    try {
      return await api<Account>(`/accounts/${id}`)
    } catch {
      return undefined
    }
  },

  async create(data: Omit<Account, 'id' | 'createdAt'>): Promise<string> {
    const id = uuidv4()
    await api('/accounts', {
      method: 'POST',
      body: { ...data, id, createdAt: Date.now() },
    })
    return id
  },

  async update(id: string, data: Partial<Account>): Promise<void> {
    await api(`/accounts/${id}`, { method: 'PUT', body: data })
  },

  async delete(id: string): Promise<void> {
    await api(`/accounts/${id}`, { method: 'DELETE' })
  },
}
