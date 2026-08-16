import { create } from 'zustand'
import { Transaction, Category, Goal, Budget, Account, RecurringIncome, RecurringExpense, TransactionType } from '../types'
import { transactionRepo } from '../db/transactions'
import { categoryRepo } from '../db/categories'
import { goalRepo } from '../db/goals'
import { budgetRepo } from '../db/budgets'
import { accountRepo } from '../db/accounts'
import { recurringIncomeRepo } from '../db/recurringIncomes'
import { recurringExpenseRepo } from '../db/recurringExpenses'
import { toast } from '../components/ui/Toast'
import { formatMoney } from '../utils/format'
import { api, setToken, getToken, ApiError, API_BASE } from '../api/client'
import { Capacitor } from '@capacitor/core'
import { getLocalCounts } from '../db/localData'

interface AppState {
  // 数据
  transactions: Transaction[]
  categories: Category[]
  goals: Goal[]
  budgets: Budget[]
  accounts: Account[]
  recurringIncomes: RecurringIncome[]
  recurringExpenses: RecurringExpense[]
  
  // 加载状态
  isLoading: boolean
  isInitialized: boolean

  // 认证状态
  authStatus: 'checking' | 'needSetup' | 'login' | 'ready'
  needsMigration: boolean

  // 认证操作
  checkAuth: () => Promise<void>
  setup: (password: string) => Promise<void>
  login: (password: string) => Promise<void>
  logout: () => void
  
  // 操作
  initialize: (opts?: { skipMigrationCheck?: boolean }) => Promise<void>
  processDueRecurring: () => Promise<void>
  
  // 交易操作
  addTransaction: (data: Omit<Transaction & { accountId: string }, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateTransaction: (id: string, data: Partial<Transaction>) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
  refreshTransactions: () => Promise<void>
  
  // 分类操作
  refreshCategories: () => Promise<void>
  addCategory: (data: Omit<Category, 'id'>) => Promise<void>
  updateCategory: (id: string, data: Partial<Category>) => Promise<void>
  deleteCategory: (id: string) => Promise<void>
  getDefaultCategoryId: (type: TransactionType) => string
  
  // 目标操作
  addGoal: (data: Omit<Goal, 'id' | 'createdAt'>) => Promise<string>
  updateGoal: (id: string, data: Partial<Goal>) => Promise<void>
  deleteGoal: (id: string) => Promise<void>
  addGoalTransaction: (data: Omit<Goal, 'id' | 'createdAt'> & { goalId: string; type: 'deposit' | 'withdraw'; amount: number; accountId: string }) => Promise<void>
  purchaseGoal: (goalId: string) => Promise<void>
  promoteGoal: (goalId: string) => Promise<void>
  rejectGoal: (goalId: string) => Promise<void>
  refreshGoals: () => Promise<void>
  
  // 预算操作
  setBudget: (data: Omit<Budget, 'id'>) => Promise<void>
  refreshBudgets: () => Promise<void>
  
  // 账户操作
  refreshAccounts: () => Promise<void>
  addAccount: (data: Omit<Account, 'id' | 'createdAt'>) => Promise<void>
  updateAccount: (id: string, data: Partial<Account>) => Promise<void>
  deleteAccount: (id: string) => Promise<void>
  adjustAccountBalance: (accountId: string, type: 'deposit' | 'withdraw', amount: number, note?: string) => Promise<void>
  setAccountFrozen: (id: string, frozen: boolean, note?: string) => Promise<void>
  
  // 周期性收入操作
  refreshRecurringIncomes: () => Promise<void>
  addRecurringIncome: (data: Omit<RecurringIncome, 'id' | 'createdAt'>) => Promise<void>
  updateRecurringIncome: (id: string, data: Partial<RecurringIncome>) => Promise<void>
  deleteRecurringIncome: (id: string) => Promise<void>
  toggleRecurringIncome: (id: string, enabled: boolean) => Promise<void>
  
  // 周期性支出操作
  refreshRecurringExpenses: () => Promise<void>
  addRecurringExpense: (data: Omit<RecurringExpense, 'id' | 'createdAt'>) => Promise<void>
  updateRecurringExpense: (id: string, data: Partial<RecurringExpense>) => Promise<void>
  deleteRecurringExpense: (id: string) => Promise<void>
  toggleRecurringExpense: (id: string, enabled: boolean) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  transactions: [],
  categories: [],
  goals: [],
  budgets: [],
  accounts: [],
  recurringIncomes: [],
  recurringExpenses: [],
  isLoading: false,
  isInitialized: false,
  authStatus: 'checking',
  needsMigration: false,

  // 认证操作
  checkAuth: async () => {
    // 原生平台 + 默认模拟器地址：真机连不上，直接跳登录页让用户设置服务器地址
    if (Capacitor.isNativePlatform() && API_BASE === 'http://10.0.2.2:3001') {
      set({ authStatus: 'login' })
      return
    }
    try {
      const status = await api<{ needSetup: boolean }>('/auth/status')
      if (status.needSetup) {
        set({ authStatus: 'needSetup' })
        return
      }
      // 本地已有 token：校验有效性，有效则直接进入应用
      if (getToken()) {
        try {
          await api('/verify')
          set({ authStatus: 'ready' })
          return
        } catch {
          setToken(null)
        }
      }
      set({ authStatus: 'login' })
    } catch {
      set({ authStatus: 'login' })
      toast('无法连接服务器，请先启动后端（npm run server）', 'error')
    }
  },

  setup: async (password: string) => {
    const { token } = await api<{ token: string }>('/auth/setup', {
      method: 'POST',
      body: { password },
    })
    setToken(token)
    set({ authStatus: 'ready' })
  },

  login: async (password: string) => {
    const { token } = await api<{ token: string }>('/auth/login', {
      method: 'POST',
      body: { password },
    })
    setToken(token)
    set({ authStatus: 'ready', isInitialized: false })
  },

  logout: () => {
    setToken(null)
    set({
      authStatus: 'login',
      isInitialized: false,
      needsMigration: false,
      transactions: [],
      categories: [],
      goals: [],
      budgets: [],
      accounts: [],
      recurringIncomes: [],
      recurringExpenses: [],
    })
  },

  initialize: async (opts?: { skipMigrationCheck?: boolean }) => {
    if (get().isInitialized) return

    set({ isLoading: true })

    try {
      // 首次迁移判断：云端无数据且本地有旧数据 → 引导上传
      if (!opts?.skipMigrationCheck && !localStorage.getItem('fp_migrated')) {
        const status = await api<{ hasData: boolean }>('/auth/status')
        if (!status.hasData) {
          const counts = await getLocalCounts()
          if (counts.total > 0) {
            set({ needsMigration: true, isLoading: false })
            return
          }
        }
        localStorage.setItem('fp_migrated', '1')
      }

      // 预设数据初始化（服务端幂等处理，含去重）
      await api('/bootstrap', { method: 'POST' })

      // 加载所有数据
      const [transactions, categories, goals, budgets, accounts, recurringIncomes, recurringExpenses] = await Promise.all([
        transactionRepo.getAll(),
        categoryRepo.getAll(),
        goalRepo.getAll(),
        budgetRepo.getAll(),
        accountRepo.getAll(),
        recurringIncomeRepo.getAll(),
        recurringExpenseRepo.getAll(),
      ])

      set({
        transactions,
        categories,
        goals,
        budgets,
        accounts,
        recurringIncomes,
        recurringExpenses,
        isLoading: false,
        isInitialized: true,
        needsMigration: false,
      })

      // 自动处理到期的周期性收支（服务端单事务，防多设备重复）
      await get().processDueRecurring()
    } catch (error) {
      console.error('Failed to initialize:', error)
      set({ isLoading: false })
      if (error instanceof ApiError && error.status === 401) {
        get().logout()
      } else if (error instanceof ApiError && error.status === 0) {
        toast(error.message, 'error')
      }
    }
  },

  // 交易操作（带账户）
  addTransaction: async (data) => {
    await transactionRepo.create(data as Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>)
    
    const tx = { ...data as Omit<Transaction & { accountId: string }, 'id' | 'createdAt' | 'updatedAt'> }
    
    await get().refreshTransactions()
    await get().refreshAccounts()
    toast(`已记录${tx.type === 'income' ? '收入' : '支出'} ${formatMoney(tx.amount)}`, 'success')
  },

  updateTransaction: async (id, data) => {
    await transactionRepo.update(id, data)
    await get().refreshTransactions()
  },

  deleteTransaction: async (id) => {
    await transactionRepo.delete(id)
    await get().refreshTransactions()
    await get().refreshAccounts()
    toast('已删除', 'info')
  },

  refreshTransactions: async () => {
    const transactions = await transactionRepo.getAll()
    set({ transactions })
  },

  // 分类操作
  refreshCategories: async () => {
    const categories = await categoryRepo.getAll()
    set({ categories })
  },

  addCategory: async (data) => {
    await categoryRepo.create(data)
    await get().refreshCategories()
    toast(`分类"${data.name}"已创建`, 'success')
  },

  updateCategory: async (id, data) => {
    await categoryRepo.update(id, data)
    await get().refreshCategories()
  },

  deleteCategory: async (id) => {
    const cat = get().categories.find(c => c.id === id)
    await categoryRepo.delete(id)
    await get().refreshCategories()
    toast(`分类"${cat?.name}"已删除`, 'info')
  },

  getDefaultCategoryId: (type) => {
    const cat = get().categories.find(c => c.type === type && c.name === '未分类')
    return cat?.id || ''
  },

  // 目标操作
  addGoal: async (data) => {
    const id = await goalRepo.create(data)
    await get().refreshGoals()
    toast(`目标"${data.name}"已创建`, 'success')
    return id
  },

  updateGoal: async (id, data) => {
    await goalRepo.update(id, data)
    await get().refreshGoals()
  },

  deleteGoal: async (id) => {
    const goal = get().goals.find(g => g.id === id)
    await goalRepo.delete(id)
    await get().refreshGoals()
    toast(`目标"${goal?.name}"已删除`, 'info')
  },

  // 冷静期结束/放弃后转正：进入「想买的东西」正常攒钱
  promoteGoal: async (goalId) => {
    const goal = get().goals.find(g => g.id === goalId)
    if (!goal) return
    if (goal.status === 'cooling' && goal.coolingEndsAt && Date.now() < goal.coolingEndsAt) {
      toast('还在冷静期内，等倒计时结束再转正', 'error')
      return
    }
    await goalRepo.update(goalId, { status: 'active', decidedAt: Date.now() })
    await get().refreshGoals()
    toast(`「${goal.name}」已加入想买的东西，开始攒钱吧`, 'success')
  },

  // 放弃心动：计入省钱战绩（省下的就是赚到的）
  rejectGoal: async (goalId) => {
    const goal = get().goals.find(g => g.id === goalId)
    if (!goal) return
    await goalRepo.update(goalId, { status: 'rejected', decidedAt: Date.now() })
    await get().refreshGoals()
    toast(`明智！本次省钱 +¥${(goal.targetAmount / 100).toFixed(2)}`, 'success')
  },

  addGoalTransaction: async (data) => {
    // 1. 更新目标金额
    await goalRepo.adjustAmount(data.goalId, data.type, data.amount)
    
    // 2. 联动账户余额（通过调整 initialBalance 实现资金转移）
    const { accounts, transactions } = get()
    const computeBalance = (accId: string) => {
      const acc = accounts.find(a => a.id === accId)
      if (!acc) return 0
      const accTxs = transactions.filter(t => t.accountId === accId)
      const income = accTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
      const expense = accTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
      return acc.initialBalance + income - expense
    }
    
    if (data.type === 'deposit') {
      // 攒钱：从账户划出（冻结账户如“老婆本”不可划出）
      if (data.accountId === 'all') {
        // 从总资金按余额比例分配扣减（仅非冻结账户参与）
        const availableAccounts = accounts.filter(a => !a.isFrozen)
        const balances = availableAccounts.map(acc => ({ id: acc.id, balance: Math.max(0, computeBalance(acc.id)) }))
        const total = balances.reduce((s, b) => s + b.balance, 0)
        let remaining = data.amount
        if (total < data.amount) {
          toast(availableAccounts.length < accounts.length ? '可用余额不足（冻结的钱不能动）' : '账户余额不足，无法攒钱', 'error')
          await goalRepo.adjustAmount(data.goalId, 'withdraw', data.amount) // 回滚
          return
        }
        for (const b of balances) {
          if (remaining <= 0) break
          const ratio = b.balance / total
          const deduct = Math.min(b.balance, Math.round(data.amount * ratio))
          const finalDeduct = Math.min(deduct, remaining)
          if (finalDeduct > 0) {
            const acc = accounts.find(a => a.id === b.id)!
            await accountRepo.update(b.id, { initialBalance: acc.initialBalance - finalDeduct })
            remaining -= finalDeduct
          }
        }
        if (remaining > 0) {
          // 由于四舍五入可能剩几分钱，从第一个可用账户再扣
          const first = availableAccounts[0]
          if (first) await accountRepo.update(first.id, { initialBalance: first.initialBalance - remaining })
        }
      } else {
        // 从指定账户划出
        const acc = accounts.find(a => a.id === data.accountId)
        if (acc?.isFrozen) {
          toast(`「${acc.name}」已冻结${acc.frozenNote ? `（${acc.frozenNote}）` : ''}，不能动这笔钱`, 'error')
          await goalRepo.adjustAmount(data.goalId, 'withdraw', data.amount) // 回滚
          return
        }
        if (acc) {
          await accountRepo.update(acc.id, { initialBalance: acc.initialBalance - data.amount })
        }
      }
    } else {
      // 取用：把钱放回账户
      if (data.accountId === 'all') {
        // 平均分配到各账户
        const activeAccounts = accounts.length > 0 ? accounts : []
        if (activeAccounts.length > 0) {
          const perAccount = Math.floor(data.amount / activeAccounts.length)
          let remainder = data.amount - perAccount * activeAccounts.length
          for (const acc of activeAccounts) {
            const add = perAccount + (remainder > 0 ? 1 : 0)
            if (remainder > 0) remainder--
            await accountRepo.update(acc.id, { initialBalance: acc.initialBalance + add })
          }
        }
      } else {
        // 放回指定账户
        const acc = accounts.find(a => a.id === data.accountId)
        if (acc) {
          await accountRepo.update(acc.id, { initialBalance: acc.initialBalance + data.amount })
        }
      }
    }
    
    await get().refreshGoals()
    await get().refreshAccounts()
    toast(data.type === 'deposit' ? `已从${data.accountId === 'all' ? '总资金' : '账户'}划入 ${formatMoney(data.amount)}` : `已取回 ${formatMoney(data.amount)}`, 'success')
  },

  // 现在就买：从账户补齐差额（按余额比例分摊），并将目标标记为已达成
  purchaseGoal: async (goalId) => {
    const { goals, accounts, transactions } = get()
    const goal = goals.find(g => g.id === goalId)
    if (!goal) return

    // 冷静期硬限制：期内禁止购买（防御性双保险，UI 层同样不可达）
    if (goal.status === 'cooling' && goal.coolingEndsAt && Date.now() < goal.coolingEndsAt) {
      toast('还在冷静期内，等倒计时结束再做决定', 'error')
      return
    }

    const gap = Math.max(0, goal.targetAmount - goal.currentAmount)

    if (gap > 0) {
      const computeBalance = (accId: string) => {
        const acc = accounts.find(a => a.id === accId)
        if (!acc) return 0
        const accTxs = transactions.filter(t => t.accountId === accId)
        const income = accTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
        const expense = accTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
        return acc.initialBalance + income - expense
      }
      const availableAccounts = accounts.filter(a => !a.isFrozen)
      const balances = availableAccounts.map(acc => ({ id: acc.id, balance: Math.max(0, computeBalance(acc.id)) }))
      const total = balances.reduce((s, b) => s + b.balance, 0)
      if (total < gap) {
        toast(availableAccounts.length < accounts.length ? '可用余额不足以补齐差额（冻结的钱不能动）' : '账户余额不足以补齐差额', 'error')
        return
      }
      // 按余额比例从各账户扣减（与攒钱「总资金」逻辑一致）
      let remaining = gap
      for (const b of balances) {
        if (remaining <= 0) break
        const ratio = b.balance / total
        const deduct = Math.min(b.balance, Math.round(gap * ratio))
        const finalDeduct = Math.min(deduct, remaining)
        if (finalDeduct > 0) {
          const acc = accounts.find(a => a.id === b.id)!
          await accountRepo.update(b.id, { initialBalance: acc.initialBalance - finalDeduct })
          remaining -= finalDeduct
        }
      }
      if (remaining > 0) {
        const first = availableAccounts[0]
        if (first) await accountRepo.update(first.id, { initialBalance: first.initialBalance - remaining })
      }
    }

    // 目标达成
    await goalRepo.update(goalId, {
      currentAmount: goal.targetAmount,
      status: 'completed',
      completedAt: Date.now(),
    })
    await get().refreshGoals()
    await get().refreshAccounts()
    toast(`已记录购买「${goal.name}」，目标达成`, 'success')
  },

  refreshGoals: async () => {
    const goals = await goalRepo.getAll()
    set({ goals })
  },

  // 预算操作
  setBudget: async (data) => {
    await budgetRepo.upsert(data)
    await get().refreshBudgets()
    toast('预算已更新', 'success')
  },

  refreshBudgets: async () => {
    const budgets = await budgetRepo.getAll()
    set({ budgets })
  },

  // 账户操作
  refreshAccounts: async () => {
    const accounts = await accountRepo.getAll()
    
    // 计算每个账户的实际余额
    const updatedAccounts = await Promise.all(
      accounts.map(async (acc) => ({
        ...acc,
        initialBalance: acc.initialBalance, // 保持初始余额不变
        // 不再存储 balance 字段，由 UI 层动态计算
      }))
    )
    
    set({ accounts: updatedAccounts })
  },

  addAccount: async (data) => {
    await accountRepo.create(data)
    await get().refreshAccounts()
    toast(`账户"${data.name}"已添加`, 'success')
  },

  updateAccount: async (id, data) => {
    await accountRepo.update(id, data)
    await get().refreshAccounts()
  },

  deleteAccount: async (id) => {
    const account = get().accounts.find(a => a.id === id)
    await accountRepo.delete(id)
    await get().refreshAccounts()
    toast(`账户"${account?.name}"已删除`, 'info')
  },

  adjustAccountBalance: async () => {
    // 已移除：请使用收支记录功能
    toast('请使用收支记录功能', 'info')
  },

  // 冻结/解冻账户（如“老婆本”）：冻结的钱不计入可用余额，不可划出/支出
  setAccountFrozen: async (id, frozen, note) => {
    const acc = get().accounts.find(a => a.id === id)
    if (!acc) return
    await accountRepo.update(id, {
      isFrozen: frozen,
      ...(frozen ? { frozenNote: note?.trim() || acc.frozenNote || '' } : {}),
    })
    await get().refreshAccounts()
    toast(frozen ? `已冻结「${acc.name}」${note?.trim() || acc.frozenNote ? `（${note?.trim() || acc.frozenNote}）` : ''}` : `已解冻「${acc.name}」`, 'success')
  },

  // 周期性收入操作
  refreshRecurringIncomes: async () => {
    const recurringIncomes = await recurringIncomeRepo.getAll()
    set({ recurringIncomes })
  },

  addRecurringIncome: async (data) => {
    await recurringIncomeRepo.create(data)
    await get().refreshRecurringIncomes()
    toast(`周期性收入"${data.name}"已添加`, 'success')
  },

  updateRecurringIncome: async (id, data) => {
    await recurringIncomeRepo.update(id, data)
    await get().refreshRecurringIncomes()
  },

  deleteRecurringIncome: async (id) => {
    const income = get().recurringIncomes.find(i => i.id === id)
    await recurringIncomeRepo.delete(id)
    await get().refreshRecurringIncomes()
    toast(`周期性收入"${income?.name}"已删除`, 'info')
  },

  toggleRecurringIncome: async (id, enabled) => {
    await recurringIncomeRepo.toggleEnabled(id, enabled)
    await get().refreshRecurringIncomes()
    toast(enabled ? '已启用' : '已暂停', 'info')
  },

  // 统一处理到期的周期性收支（服务端完成，返回处理结果）
  processDueRecurring: async () => {
    const result = await api<{
      incomes: { count: number; amount: number }
      expenses: { count: number; amount: number }
    }>('/process-recurring', { method: 'POST' })

    const total = result.incomes.count + result.expenses.count
    if (total > 0) {
      await get().refreshTransactions()
      await get().refreshAccounts()

      const parts: string[] = []
      if (result.incomes.count > 0) {
        parts.push(`${result.incomes.count} 笔收入 ¥${(result.incomes.amount / 100).toFixed(2)}`)
      }
      if (result.expenses.count > 0) {
        parts.push(`${result.expenses.count} 笔支出 ¥${(result.expenses.amount / 100).toFixed(2)}`)
      }
      toast(`已自动记账：${parts.join('、')}`, 'success')
    }
  },

  // 周期性支出操作
  refreshRecurringExpenses: async () => {
    const recurringExpenses = await recurringExpenseRepo.getAll()
    set({ recurringExpenses })
  },

  addRecurringExpense: async (data) => {
    await recurringExpenseRepo.create(data)
    await get().refreshRecurringExpenses()
    toast(`周期性支出"${data.name}"已添加`, 'success')
  },

  updateRecurringExpense: async (id, data) => {
    await recurringExpenseRepo.update(id, data)
    await get().refreshRecurringExpenses()
  },

  deleteRecurringExpense: async (id) => {
    const expense = get().recurringExpenses.find(i => i.id === id)
    await recurringExpenseRepo.delete(id)
    await get().refreshRecurringExpenses()
    toast(`周期性支出"${expense?.name}"已删除`, 'info')
  },

  toggleRecurringExpense: async (id, enabled) => {
    await recurringExpenseRepo.toggleEnabled(id, enabled)
    await get().refreshRecurringExpenses()
    toast(enabled ? '已启用' : '已暂停', 'info')
  },
}))
