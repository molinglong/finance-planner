// ============================================
// 周期收支自动记账（单事务，防多设备重复处理）
// 逻辑移植自原前端仓库，并修复了 endDate 判断反了的旧 Bug
// ============================================
import crypto from 'node:crypto'
import { db } from './db'

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * 今天是否应该处理该周期项
 * 注：原前端实现中 endDate 判断写反了（结束日期之前反而跳过），
 * 此处修正为：过了结束日期才跳过。
 */
function shouldProcessToday(item: Record<string, any>, today: Date, todayStr: string): boolean {
  if (item.isEnabled !== 1) return false
  if (item.lastProcessed === todayStr) return false
  if (item.endDate && todayStr > String(item.endDate)) return false // 已过结束日期
  if (todayStr < String(item.startDate)) return false // 还没到开始日期

  switch (item.frequency) {
    case 'daily':
      return true
    case 'weekly':
      return today.getDay() === item.dayOfWeek
    case 'monthly':
      return today.getDate() === item.dayOfMonth
    case 'yearly': {
      const startDate = new Date(`${String(item.startDate).slice(0, 10)}T00:00:00`)
      return today.getMonth() + 1 === startDate.getMonth() + 1 && today.getDate() === startDate.getDate()
    }
    default:
      return false
  }
}

interface ProcessResult {
  incomes: { count: number; amount: number }
  expenses: { count: number; amount: number }
}

function processTable(
  table: 'recurringIncomes' | 'recurringExpenses',
  type: 'income' | 'expense',
  label: string,
  counter: { count: number; amount: number },
  today: Date,
  todayStr: string,
): void {
  const rows = db.prepare(`SELECT * FROM "${table}" WHERE "isEnabled" = 1 ORDER BY rowid ASC`).all() as Record<string, any>[]
  const insertTx = db.prepare(
    `INSERT INTO transactions ("id","type","amount","categoryId","accountId","date","note","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?)`,
  )
  const markProcessed = db.prepare(`UPDATE "${table}" SET "lastProcessed" = ? WHERE "id" = ?`)

  // 冻结账户（如“老婆本”）不可支出：落在冻结账户上的周期支出跳过记账，
  // 也不推进 lastProcessed，解冻后当天再次触发仍可补上
  const frozenAccountIds =
    type === 'expense'
      ? new Set(
          (db.prepare(`SELECT "id" FROM accounts WHERE "isFrozen" = 1`).all() as Record<string, any>[]).map(
            r => String(r.id),
          ),
        )
      : new Set<string>()

  for (const item of rows) {
    if (!shouldProcessToday(item, today, todayStr)) continue
    if (type === 'expense' && frozenAccountIds.has(String(item.accountId))) continue
    const now = Date.now()
    insertTx.run(
      crypto.randomUUID(),
      type,
      item.amount,
      item.categoryId,
      item.accountId,
      todayStr,
      item.note || `自动${label} - ${item.name}`,
      now,
      now,
    )
    markProcessed.run(todayStr, item.id)
    counter.count += 1
    counter.amount += item.amount as number
  }
}

/** 处理所有今天到期的周期收支（单事务） */
export function processDueRecurring(): ProcessResult {
  const today = new Date()
  const todayStr = ymd(today)
  const result: ProcessResult = {
    incomes: { count: 0, amount: 0 },
    expenses: { count: 0, amount: 0 },
  }

  db.exec('BEGIN')
  try {
    processTable('recurringIncomes', 'income', '收入', result.incomes, today, todayStr)
    processTable('recurringExpenses', 'expense', '支出', result.expenses, today, todayStr)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  return result
}
