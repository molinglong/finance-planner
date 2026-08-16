import { RecurringIncome } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { isBefore, startOfDay } from 'date-fns'
import { api } from '../api/client'

// 说明：到期自动记账（getDueToday/markAsProcessed）已移至后端 POST /api/process-recurring

export const recurringIncomeRepo = {
  async getAll(): Promise<RecurringIncome[]> {
    return api<RecurringIncome[]>('/recurringIncomes')
  },

  async getById(id: string): Promise<RecurringIncome | undefined> {
    try {
      return await api<RecurringIncome>(`/recurringIncomes/${id}`)
    } catch {
      return undefined
    }
  },

  async create(data: Omit<RecurringIncome, 'id' | 'createdAt'>): Promise<string> {
    const id = uuidv4()
    await api('/recurringIncomes', { method: 'POST', body: { ...data, id, createdAt: Date.now() } })
    return id
  },

  async update(id: string, data: Partial<RecurringIncome>): Promise<void> {
    await api(`/recurringIncomes/${id}`, { method: 'PUT', body: data })
  },

  async delete(id: string): Promise<void> {
    await api(`/recurringIncomes/${id}`, { method: 'DELETE' })
  },

  async toggleEnabled(id: string, enabled: boolean): Promise<void> {
    await this.update(id, { isEnabled: enabled })
  },

  // 获取下次处理日期（用于预览）
  getNextProcessDate(income: RecurringIncome): Date | null {
    if (!income.isEnabled) return null

    const startDate = new Date(income.startDate)
    const today = startOfDay(new Date())

    switch (income.frequency) {
      case 'daily':
        return isBefore(today, startDate) ? startDate : today

      case 'weekly': {
        const dayOfWeek = income.dayOfWeek || 0
        const currentDay = today.getDay()
        const daysUntilNext = (dayOfWeek - currentDay + 7) % 7
        const nextDate = daysUntilNext === 0 ? today : new Date(today.getTime() + daysUntilNext * 86400000)
        return isBefore(nextDate, startDate) ? startDate : nextDate
      }

      case 'monthly': {
        const dayOfMonth = income.dayOfMonth || 1
        let nextDate = new Date(today.getFullYear(), today.getMonth(), dayOfMonth)
        if (isBefore(nextDate, today)) {
          nextDate = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth)
        }
        return isBefore(nextDate, startDate) ? startDate : nextDate
      }

      case 'yearly': {
        const incomeDate = new Date(income.startDate)
        let nextDate = new Date(today.getFullYear(), incomeDate.getMonth(), incomeDate.getDate())
        if (isBefore(nextDate, today)) {
          nextDate = new Date(today.getFullYear() + 1, incomeDate.getMonth(), incomeDate.getDate())
        }
        return isBefore(nextDate, startDate) ? startDate : nextDate
      }

      default:
        return null
    }
  },
}
