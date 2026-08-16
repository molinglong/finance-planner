// ============================================
// 购买决策分析（纯函数）
// 供「想买的东西」页的分析弹窗使用
// 核心修正：
//  1. 存钱罐感知——攒钱时钱已从账户划出，购买时账户只需再补差额（targetAmount - currentAmount）
//  2. 排除自指——分析某个目标时不计算它对自己的影响
// ============================================
import { Account, Goal, Transaction, RecurringFrequency } from '../types'
import { addDays, addMonths } from 'date-fns'

/** 只含日期的字符串按本地时区解析（new Date('YYYY-MM-DD') 会按 UTC 零点，东八区要到早 8 点才“到今天”） */
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 周期项最小结构（收入/支出共用） */
interface RecurringLike {
  amount: number
  frequency: RecurringFrequency
  startDate: string
  endDate?: string
  isEnabled: boolean
}

/** 频率 → 每月发生次数（连续近似，供模拟引擎复用） */
export function monthlyRate(frequency: RecurringFrequency): number {
  switch (frequency) {
    case 'daily': return 365.25 / 12
    case 'weekly': return 365.25 / 12 / 7
    case 'yearly': return 1 / 12
    default: return 1 // monthly
  }
}

/** 周期项在指定时点是否生效（启用且在起止日内，供模拟引擎复用） */
export function isEffective(item: RecurringLike, at: Date): boolean {
  if (!item.isEnabled) return false
  if (parseLocalDate(item.startDate) > at) return false
  if (item.endDate && parseLocalDate(item.endDate) < at) return false
  return true
}

/** 周期项在 [from, to] 窗口内的估算总额（按时间比例连续近似） */
function estimateWindowAmount(item: RecurringLike, from: Date, to: Date): number {
  const itemStart = parseLocalDate(item.startDate)
  const start = itemStart > from ? itemStart : from
  const itemEnd = item.endDate ? parseLocalDate(item.endDate) : null
  const end = itemEnd && itemEnd < to ? itemEnd : to
  if (start >= end) return 0
  const months = (end.getTime() - start.getTime()) / (365.25 / 12 * 86400000)
  return item.amount * monthlyRate(item.frequency) * months
}

export interface AccountBalance {
  account: Account
  balance: number
}

export interface GoalImpact {
  goalId: string
  goalName: string
  goalIcon: string
  currentAmount: number
  targetAmount: number
  remaining: number
  currentProgress: number
  originalMonths: number
  originalEndDate: Date
  delayedMonths: number
  newEndDate: Date
}

export interface PurchaseAnalysis {
  itemName: string
  price: number // 物品价格（分）
  alreadySaved: number // 存钱罐里已攒的（分）
  gap: number // 还需从账户补的差额（分）
  totalBalance: number // 账户总余额（不含存钱罐）
  balanceAfter: number // 买完后账户余额 = totalBalance - gap
  canAfford: boolean
  avgDailyExpense: number // 近30天日均消费（分）
  daysOfSurvival: number // 买完后余额能撑几天（999 = 无消费记录）
  goalImpacts: GoalImpact[] // 对其他进行中目标的影响
}

/** 计算各账户实时余额 */
export function computeAccountBalances(accounts: Account[], transactions: Transaction[]): AccountBalance[] {
  return accounts.map(acc => {
    const accTxs = transactions.filter(t => t.accountId === acc.id)
    const income = accTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
    const expense = accTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
    return { account: acc, balance: acc.initialBalance + income - expense }
  })
}

export interface AvailableBalance {
  available: number // 可用余额（非冻结账户合计，分）
  frozen: number   // 冻结金额（分）
  total: number    // 总余额（分）
}

/** 可用余额：冻结账户（如“老婆本”）不计入可用，但仍是总资产 */
export function computeAvailableBalance(accounts: Account[], transactions: Transaction[]): AvailableBalance {
  let available = 0
  let frozen = 0
  for (const { account, balance } of computeAccountBalances(accounts, transactions)) {
    if (account.isFrozen) frozen += balance
    else available += balance
  }
  return { available, frozen, total: available + frozen }
}

/** 近30天日均消费 */
export function computeAvgDailyExpense(transactions: Transaction[]): number {
  const now = new Date()
  const thirtyDaysAgo = addDays(now, -30)
  const recentExpenses = transactions.filter(t => {
    if (t.type !== 'expense') return false
    const txDate = parseLocalDate(t.date)
    return txDate >= thirtyDaysAgo && txDate <= now
  })
  return recentExpenses.reduce((sum, t) => sum + t.amount, 0) / 30
}

/** 每月可存拆解（引入周期性收支，防双重计算） */
export interface MonthlySavableBreakdown {
  fixedIncome: number // 前瞻：每月固定收入（工资等周期性收入折算）
  fixedExpense: number // 前瞻：每月固定支出（会员等周期性支出折算）
  variableNet: number // 历史：月均可变结余（剔除周期项后的日常结余）
  historicalNet: number // 参考：近几个月总结余均值（含周期项）
  savable: number // 每月可存 = fixedIncome - fixedExpense + variableNet
}

/**
 * 每月可存金额（自动引入周期性收支）
 * 历史交易里已包含周期项生成的交易，直接叠加会双重计算；
 * 因此先从历史均值中剔除周期项贡献，再按当前配置加回前瞻固定净额。
 */
export function computeMonthlySavable(
  transactions: Transaction[],
  recurringIncomes: RecurringLike[] = [],
  recurringExpenses: RecurringLike[] = []
): MonthlySavableBreakdown {
  const now = new Date()
  const windowFrom = addMonths(now, -3)

  // 1. 历史月均总结余（原有口径，仅统计有交易的月份）
  const monthGroups: Record<string, { income: number; expense: number }> = {}
  transactions.forEach(t => {
    if (parseLocalDate(t.date) < windowFrom) return
    const monthKey = t.date.slice(0, 7)
    if (!monthGroups[monthKey]) monthGroups[monthKey] = { income: 0, expense: 0 }
    if (t.type === 'income') monthGroups[monthKey].income += t.amount
    else monthGroups[monthKey].expense += t.amount
  })
  const monthCount = Object.keys(monthGroups).length
  const historicalNet = monthCount === 0 ? 0
    : Object.values(monthGroups).reduce((sum, m) => sum + Math.max(0, m.income - m.expense), 0) / monthCount

  // 2. 周期项在历史窗口内的月均贡献（用于从历史中剔除）
  const avgDivisor = monthCount > 0 ? monthCount : 1
  const histFixedIncome = recurringIncomes.reduce((s, it) => s + estimateWindowAmount(it, windowFrom, now), 0) / avgDivisor
  const histFixedExpense = recurringExpenses.reduce((s, it) => s + estimateWindowAmount(it, windowFrom, now), 0) / avgDivisor

  // 3. 前瞻：当前配置下每月固定收支（仅生效中的周期项）
  const fixedIncome = recurringIncomes
    .filter(it => isEffective(it, now))
    .reduce((s, it) => s + it.amount * monthlyRate(it.frequency), 0)
  const fixedExpense = recurringExpenses
    .filter(it => isEffective(it, now))
    .reduce((s, it) => s + it.amount * monthlyRate(it.frequency), 0)

  // 4. 可变结余 = 历史总结余 − 历史中周期贡献
  const variableNet = Math.max(0, historicalNet - (histFixedIncome - histFixedExpense))

  return {
    fixedIncome,
    fixedExpense,
    variableNet,
    historicalNet,
    savable: Math.max(0, fixedIncome - fixedExpense + variableNet),
  }
}

/** 构建购买分析 */
export function buildPurchaseAnalysis(params: {
  itemName: string
  price: number // 分
  goal?: Goal // 目标模式：分析的正是这个想买的东西
  totalBalance: number // 账户总余额（分）
  avgDailyExpense: number // 分
  monthlySavable: number // 分
  goals: Goal[] // 全部目标（用于计算对其他目标的影响）
}): PurchaseAnalysis {
  const { itemName, price, goal, totalBalance, avgDailyExpense, monthlySavable, goals } = params

  const alreadySaved = goal ? goal.currentAmount : 0
  const gap = Math.max(0, price - alreadySaved)
  const balanceAfter = totalBalance - gap
  const canAfford = balanceAfter >= 0
  const daysOfSurvival = avgDailyExpense > 0 ? Math.floor(balanceAfter / avgDailyExpense) : 999

  // 对其他进行中目标的影响（排除自己）：今天从账户流出 gap 元，会推迟其他目标
  const goalImpacts: GoalImpact[] = goals
    .filter(g => g.status === 'active' && g.id !== goal?.id)
    .map(g => {
      const remaining = g.targetAmount - g.currentAmount
      const originalMonths = monthlySavable > 0 ? Math.ceil(remaining / monthlySavable) : 0
      const originalEndDate = originalMonths > 0 ? addMonths(new Date(), originalMonths) : new Date()

      const totalNeeded = remaining + gap
      const monthsWithPurchase = monthlySavable > 0 ? Math.ceil(totalNeeded / monthlySavable) : 0
      const delayedMonths = Math.max(0, monthsWithPurchase - originalMonths)
      const newEndDate = monthsWithPurchase > 0 ? addMonths(new Date(), monthsWithPurchase) : new Date()

      return {
        goalId: g.id,
        goalName: g.name,
        goalIcon: g.icon,
        currentAmount: g.currentAmount,
        targetAmount: g.targetAmount,
        remaining,
        currentProgress: g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0,
        originalMonths,
        originalEndDate,
        delayedMonths,
        newEndDate,
      }
    })

  return {
    itemName,
    price,
    alreadySaved,
    gap,
    totalBalance,
    balanceAfter,
    canAfford,
    avgDailyExpense,
    daysOfSurvival,
    goalImpacts,
  }
}
