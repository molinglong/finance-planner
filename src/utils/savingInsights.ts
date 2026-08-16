// ============================================
// 省钱洞察（纯函数）：小额消费统计 / 省钱战绩 / 冷静期工具
// 供「省钱」页使用，不依赖任何 UI
// ============================================
import { Category, Goal, Transaction } from '../types'

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ============ 小额消费警示（拿铁因子） ============

export interface SmallExpenseCategoryStat {
  categoryId: string
  categoryName: string
  categoryColor: string
  count: number
  total: number
}

export interface SmallExpenseStats {
  threshold: number // 阈值（分）
  count: number // 本月小额笔数
  total: number // 本月小额总额（分）
  ratio: number // 占本月总支出比例 0-100
  topCategories: SmallExpenseCategoryStat[]
  lastPeriodCount: number // 上月同期笔数
  lastPeriodTotal: number // 上月同期总额（分）
  /** 本月小额 − 上月同期小额（分），正数 = 花得更多了 */
  deltaTotal: number
}

/**
 * 本月小额支出统计（单笔金额 ≤ 阈值算小额），并与上月同期对比
 * 上月同期口径：上月 1 日 ~ 上月同日（如 8 月 16 日 → 7 月 1 日 ~ 7 月 16 日）
 */
export function computeSmallExpenseStats(
  transactions: Transaction[],
  thresholdCent: number,
  categories: Category[],
  now: Date = new Date()
): SmallExpenseStats {
  const curMonth = monthKey(now)

  // 上月同日截止（ clamp 到上月实际天数，如 3 月 31 日 → 2 月 28 日）
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const daysInLastMonth = new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1, 0).getDate()
  const lastDay = Math.min(now.getDate(), daysInLastMonth)
  const lastMonthPrefix = monthKey(lastMonthDate)
  const lastCutoff = `${lastMonthPrefix}-${String(lastDay).padStart(2, '0')}`

  const isSmall = (t: Transaction) => t.type === 'expense' && t.amount > 0 && t.amount <= thresholdCent

  let count = 0
  let total = 0
  let monthExpenseAll = 0
  let lastPeriodCount = 0
  let lastPeriodTotal = 0
  const catMap = new Map<string, { count: number; total: number }>()

  for (const t of transactions) {
    if (t.type === 'expense' && t.date.slice(0, 7) === curMonth) {
      monthExpenseAll += t.amount
      if (isSmall(t)) {
        count++
        total += t.amount
        const c = catMap.get(t.categoryId) || { count: 0, total: 0 }
        c.count++
        c.total += t.amount
        catMap.set(t.categoryId, c)
      }
    } else if (isSmall(t) && t.date.slice(0, 7) === lastMonthPrefix && t.date <= lastCutoff) {
      lastPeriodCount++
      lastPeriodTotal += t.amount
    }
  }

  const topCategories: SmallExpenseCategoryStat[] = [...catMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 3)
    .map(([categoryId, { count: c, total: t }]) => {
      const cat = categories.find(ct => ct.id === categoryId)
      return {
        categoryId,
        categoryName: cat?.name || '未分类',
        categoryColor: cat?.color || '#D9C6B0',
        count: c,
        total: t,
      }
    })

  return {
    threshold: thresholdCent,
    count,
    total,
    ratio: monthExpenseAll > 0 ? Math.round((total / monthExpenseAll) * 100) : 0,
    topCategories,
    lastPeriodCount,
    lastPeriodTotal,
    deltaTotal: total - lastPeriodTotal,
  }
}

// ============ 省钱战绩（拒绝诱惑省下的钱） ============

export interface SavingRecord {
  id: string
  name: string
  icon: string
  amount: number // 分
  decidedAt: number
}

export interface SavingRecords {
  monthTotal: number // 本月省钱合计（分）
  allTimeTotal: number // 累计省钱（分）
  monthCount: number
  recent: SavingRecord[] // 最近记录，decidedAt 降序
}

/** 统计冷静期后放弃（status='rejected'）的目标，按 decidedAt 归月 */
export function computeSavingRecords(goals: Goal[], now: Date = new Date()): SavingRecords {
  const rejected = goals.filter(g => g.status === 'rejected')
  const curMonth = monthKey(now)

  let monthTotal = 0
  let monthCount = 0
  let allTimeTotal = 0

  for (const g of rejected) {
    allTimeTotal += g.targetAmount
    if (g.decidedAt && monthKey(new Date(g.decidedAt)) === curMonth) {
      monthTotal += g.targetAmount
      monthCount++
    }
  }

  const recent: SavingRecord[] = rejected
    .filter(g => g.decidedAt)
    .sort((a, b) => (b.decidedAt! - a.decidedAt!))
    .slice(0, 8)
    .map(g => ({ id: g.id, name: g.name, icon: g.icon, amount: g.targetAmount, decidedAt: g.decidedAt! }))

  return { monthTotal, allTimeTotal, monthCount, recent }
}

// ============ 冷静期工具 ============

/** 冷静期时长档位（天） */
export const COOLING_PRESETS: { days: number; label: string }[] = [
  { days: 3, label: '72 小时' },
  { days: 7, label: '7 天' },
  { days: 30, label: '30 天' },
]

/** 按价格智能推荐冷静期时长：≤¥100 → 72h，≤¥1000 → 7 天，>¥1000 → 30 天 */
export function recommendCoolingDays(priceCent: number): number {
  if (priceCent <= 10000) return 3
  if (priceCent <= 100000) return 7
  return 30
}

/** 倒计时剩余文案："2 天 5 小时" / "5 小时 12 分钟" / "12 分钟" / "已到期" */
export function formatRemaining(endsAt: number, now: number = Date.now()): string {
  const diff = endsAt - now
  if (diff <= 0) return '已到期'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${mins} 分钟`
  return `${Math.max(1, mins)} 分钟`
}

/** 冷静期进度 0-100（需已知起始时间，一般用 createdAt） */
export function coolingProgress(startedAt: number, endsAt: number, now: number = Date.now()): number {
  const total = endsAt - startedAt
  if (total <= 0) return 100
  return Math.min(100, Math.max(0, Math.round(((now - startedAt) / total) * 100)))
}
