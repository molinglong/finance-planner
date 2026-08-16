import { Budget } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { api } from '../api/client'

export const budgetRepo = {
  async getAll(): Promise<Budget[]> {
    return api<Budget[]>('/budgets')
  },

  async getByMonth(month: string): Promise<Budget | undefined> {
    const all = await this.getAll()
    return all.find(b => b.month === month)
  },

  async upsert(data: Omit<Budget, 'id'>): Promise<string> {
    const existing = await this.getByMonth(data.month)

    if (existing) {
      await api(`/budgets/${existing.id}`, { method: 'PUT', body: data })
      return existing.id
    } else {
      const id = uuidv4()
      await api('/budgets', { method: 'POST', body: { ...data, id } })
      return id
    }
  },

  async delete(id: string): Promise<void> {
    await api(`/budgets/${id}`, { method: 'DELETE' })
  },

  async deleteByMonth(month: string): Promise<void> {
    const existing = await this.getByMonth(month)
    if (existing) {
      await this.delete(existing.id)
    }
  },
}
