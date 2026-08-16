// ============================================
// 本地 IndexedDB（Dexie）旧数据读取 —— 仅用于一次性迁移上云
// ============================================
import { db } from './database'
import type {
  Transaction, Category, Goal, Budget, Account, RecurringIncome, RecurringExpense,
} from '../types'

/** 本地数据表的显示顺序（上传顺序，无外键依赖但保持习惯） */
export const LOCAL_TABLES = [
  { key: 'categories', label: '分类' },
  { key: 'accounts', label: '账户' },
  { key: 'transactions', label: '收支记录' },
  { key: 'goals', label: '储蓄目标' },
  { key: 'budgets', label: '预算' },
  { key: 'recurringIncomes', label: '固定收入' },
  { key: 'recurringExpenses', label: '固定支出' },
] as const

export type LocalTableKey = (typeof LOCAL_TABLES)[number]['key']

export type LocalCounts = Record<LocalTableKey, number> & { total: number }

/** 统计本地各表数据量 */
export async function getLocalCounts(): Promise<LocalCounts> {
  const empty: LocalCounts = {
    categories: 0, accounts: 0, transactions: 0, goals: 0,
    budgets: 0, recurringIncomes: 0, recurringExpenses: 0, total: 0,
  }
  try {
    const [categories, accounts, transactions, goals, budgets, recurringIncomes, recurringExpenses] =
      await Promise.all([
        db.categories.count(),
        db.accounts.count(),
        db.transactions.count(),
        db.goals.count(),
        db.budgets.count(),
        db.recurringIncomes.count(),
        db.recurringExpenses.count(),
      ])
    const counts: LocalCounts = {
      categories, accounts, transactions, goals,
      budgets, recurringIncomes, recurringExpenses,
      total: categories + accounts + transactions + goals + budgets + recurringIncomes + recurringExpenses,
    }
    return counts
  } catch {
    return empty
  }
}

/** 读取本地某张表全部数据 */
export async function getLocalTableData(key: LocalTableKey): Promise<unknown[]> {
  switch (key) {
    case 'categories': return db.categories.toArray() as Promise<Category[]>
    case 'accounts': return db.accounts.toArray() as Promise<Account[]>
    case 'transactions': return db.transactions.toArray() as Promise<Transaction[]>
    case 'goals': return db.goals.toArray() as Promise<Goal[]>
    case 'budgets': return db.budgets.toArray() as Promise<Budget[]>
    case 'recurringIncomes': return db.recurringIncomes.toArray() as Promise<RecurringIncome[]>
    case 'recurringExpenses': return db.recurringExpenses.toArray() as Promise<RecurringExpense[]>
  }
}
