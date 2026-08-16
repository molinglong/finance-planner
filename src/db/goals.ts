import { Goal, GoalStatus } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { api } from '../api/client'

// aiVerdict / aiChat 在 DB 中存 JSON 字符串（TEXT 列），进出仓库时序列化/反序列化
function goalToWire(data: Partial<Goal>): Record<string, unknown> {
  const wire: Record<string, unknown> = { ...data }
  if (wire.aiVerdict != null) wire.aiVerdict = JSON.stringify(data.aiVerdict)
  if (wire.aiChat != null) wire.aiChat = JSON.stringify(data.aiChat)
  return wire
}

function wireToGoal(g: Goal): Goal {
  let out = g
  if (out.aiVerdict != null) {
    try {
      const parsed = typeof out.aiVerdict === 'object' ? out.aiVerdict : JSON.parse(out.aiVerdict as unknown as string)
      out = { ...out, aiVerdict: parsed as Goal['aiVerdict'] }
    } catch {
      out = { ...out, aiVerdict: undefined }
    }
  }
  if (out.aiChat != null) {
    try {
      const parsed = typeof out.aiChat === 'object' ? out.aiChat : JSON.parse(out.aiChat as unknown as string)
      out = { ...out, aiChat: parsed as Goal['aiChat'] }
    } catch {
      out = { ...out, aiChat: null }
    }
  }
  return out
}

export const goalRepo = {
  async getAll(): Promise<Goal[]> {
    const list = await api<Goal[]>('/goals')
    return list.map(wireToGoal)
  },

  async getByStatus(status: GoalStatus): Promise<Goal[]> {
    const all = await this.getAll()
    return all.filter(g => g.status === status)
  },

  async getById(id: string): Promise<Goal | undefined> {
    try {
      const g = await api<Goal>(`/goals/${id}`)
      return wireToGoal(g)
    } catch {
      return undefined
    }
  },

  async create(data: Omit<Goal, 'id' | 'createdAt'>): Promise<string> {
    const id = uuidv4()
    await api('/goals', { method: 'POST', body: { ...goalToWire(data), id, createdAt: Date.now() } })
    return id
  },

  async update(id: string, data: Partial<Goal>): Promise<void> {
    await api(`/goals/${id}`, { method: 'PUT', body: goalToWire(data) })
  },

  async delete(id: string): Promise<void> {
    await api(`/goals/${id}`, { method: 'DELETE' })
  },

  // 存入/取出目标金额（直接调整当前金额）
  async adjustAmount(goalId: string, type: 'deposit' | 'withdraw', amount: number): Promise<void> {
    const goal = await this.getById(goalId)
    if (!goal) return

    const newAmount = type === 'deposit'
      ? goal.currentAmount + amount
      : goal.currentAmount - amount

    const updates: Partial<Goal> = { currentAmount: Math.max(0, newAmount) }

    // 检查是否达成目标
    if (newAmount >= goal.targetAmount && goal.status === 'active') {
      updates.status = 'completed'
      updates.completedAt = Date.now()
    } else if (goal.status === 'completed' && newAmount < goal.targetAmount) {
      updates.status = 'active'
      updates.completedAt = undefined
    }

    await this.update(goalId, updates)
  },
}
