import { Transaction } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { api } from '../api/client'

export const transactionRepo = {
  async getAll(): Promise<Transaction[]> {
    return api<Transaction[]>('/transactions')
  },

  async getByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
    const all = await this.getAll()
    return all.filter(t => t.date >= startDate && t.date <= endDate)
  },

  async getByMonth(month: string): Promise<Transaction[]> {
    const all = await this.getAll()
    return all.filter(t => t.date.startsWith(month))
  },

  async create(data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = uuidv4()
    const now = Date.now()
    await api('/transactions', {
      method: 'POST',
      body: { ...data, id, createdAt: now, updatedAt: now },
    })
    return id
  },

  async update(id: string, data: Partial<Transaction>): Promise<void> {
    await api(`/transactions/${id}`, {
      method: 'PUT',
      body: { ...data, updatedAt: Date.now() },
    })
  },

  async delete(id: string): Promise<void> {
    await api(`/transactions/${id}`, { method: 'DELETE' })
  },

  async getByCategory(categoryId: string): Promise<Transaction[]> {
    const all = await this.getAll()
    return all.filter(t => t.categoryId === categoryId)
  },
}
