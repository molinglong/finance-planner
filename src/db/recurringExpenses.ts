import { RecurringExpense } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { isBefore, startOfDay } from 'date-fns'
import { api } from '../api/client'

// 说明：到期自动记账（getDueToday/markAsProcessed）已移至后端 POST /api/process-recurring

export const recurringExpenseRepo = {
  async getAll(): Promise<RecurringExpense[]> {
    return api<RecurringExpense[]>('/recurringExpenses')
  },

  async getById(id: string): Promise<RecurringExpense | undefined> {
    try {
      return await api<RecurringExpense>(`/recurringExpenses/${id}`)
    } catch {
      return undefined
    }
  },

  async create(data: Omit<RecurringExpense, 'id' | 'createdAt'>): Promise<string> {
    const id = uuidv4()
    await api('/recurringExpenses', { method: 'POST', body: { ...data, id, createdAt: Date.now() } })
    return id
  },

  async update(id: string, data: Partial<RecurringExpense>): Promise<void> {
    await api(`/recurringExpenses/${id}`, { method: 'PUT', body: data })
  },

  async delete(id: string): Promise<void> {
    await api(`/recurringExpenses/${id}`, { method: 'DELETE' })
  },

  async toggleEnabled(id: string, enabled: boolean): Promise<void> {
    await this.update(id, { isEnabled: enabled })
  },

  // 获取下次处理日期（用于预览）
  getNextProcessDate(expense: RecurringExpense): Date | null {
    if (!expense.isEnabled) return null

    const startDate = new Date(expense.startDate)
    const today = startOfDay(new Date())

    switch (expense.frequency) {
      case 'daily':
        return isBefore(today, startDate) ? startDate : today

      case 'weekly': {
        const dayOfWeek = expense.dayOfWeek || 0
        const currentDay = today.getDay()
        const daysUntilNext = (dayOfWeek - currentDay + 7) % 7
        const nextDate = daysUntilNext === 0 ? today : new Date(today.getTime() + daysUntilNext * 86400000)
        return isBefore(nextDate, startDate) ? startDate : nextDate
      }

      case 'monthly': {
        const dayOfMonth = expense.dayOfMonth || 1
        let nextDate = new Date(today.getFullYear(), today.getMonth(), dayOfMonth)
        if (isBefore(nextDate, today)) {
          nextDate = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth)
        }
        return isBefore(nextDate, startDate) ? startDate : nextDate
      }

      case 'yearly': {
        const expenseDate = new Date(expense.startDate)
        let nextDate = new Date(today.getFullYear(), expenseDate.getMonth(), expenseDate.getDate())
        if (isBefore(nextDate, today)) {
          nextDate = new Date(today.getFullYear() + 1, expenseDate.getMonth(), expenseDate.getDate())
        }
        return isBefore(nextDate, startDate) ? startDate : nextDate
      }

      default:
        return null
    }
  },
}
