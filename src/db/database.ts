import Dexie, { Table } from 'dexie'
import { Transaction, Category, Goal, Budget, Account, RecurringIncome, RecurringExpense } from '../types'

export class FinanceDatabase extends Dexie {
  transactions!: Table<Transaction, string>
  categories!: Table<Category, string>
  goals!: Table<Goal, string>
  budgets!: Table<Budget, string>
  accounts!: Table<Account, string>
  recurringIncomes!: Table<RecurringIncome, string>
  recurringExpenses!: Table<RecurringExpense, string>

  constructor() {
    super('finance-planner')
    
    this.version(1).stores({
      transactions: 'id, type, categoryId, accountId, date, createdAt',
      categories: 'id, type, sortOrder',
      goals: 'id, status, createdAt',
      budgets: 'id, month',
      accounts: 'id, status, sortOrder',
    })
    
    // v2: 新增周期性收入表
    this.version(2).stores({
      recurringIncomes: 'id, isEnabled, frequency, lastProcessed',
    })
    
    // v3: 移除账户流水和目标交易表（简化架构）
    this.version(3).stores({
      transactions: 'id, type, categoryId, accountId, date, createdAt',
      categories: 'id, type, sortOrder',
      goals: 'id, status, createdAt',
      budgets: 'id, month',
      accounts: 'id, status, sortOrder',
      recurringIncomes: 'id, isEnabled, frequency, lastProcessed',
    }).upgrade(async tx => {
      // 将旧账户的 balance 迁移为 initialBalance
      const accounts = await tx.table('accounts').toArray()
      await Promise.all(accounts.map(async (acc: any) => {
        if (acc.balance !== undefined && acc.initialBalance === undefined) {
          await tx.table('accounts').update(acc.id, { 
            initialBalance: acc.balance, 
            balance: undefined 
          })
        }
      }))
    })
    
    // v4: 新增周期性支出表
    this.version(4).stores({
      transactions: 'id, type, categoryId, accountId, date, createdAt',
      categories: 'id, type, sortOrder',
      goals: 'id, status, createdAt',
      budgets: 'id, month',
      accounts: 'id, status, sortOrder',
      recurringIncomes: 'id, isEnabled, frequency, lastProcessed',
      recurringExpenses: 'id, isEnabled, frequency, lastProcessed',
    })
  }
}

export const db = new FinanceDatabase()
