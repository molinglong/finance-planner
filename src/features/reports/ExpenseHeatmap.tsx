import { useMemo, useState } from 'react'
import type { Transaction } from '../../types'
import { formatMoney, formatDate } from '../../utils/format'
import Card from '../../components/ui/Card'
import Icon from '../../components/ui/Icon'

// ============================================
// 支出热力图（GitHub 贡献图风格，最多近6个月）
// 行 = 周一至周日，列 = 周，颜色深浅 = 当日支出多少
// 窗口自适应：数据晚于6个月前才开始时，从第一笔支出所在周起渲染，
// 避免前半部分大片空白格子
// ============================================

// 热力等级样式（0 = 无支出 → 4 = 最多）
const LEVEL_CLASSES = [
  'bg-sand-100',
  'bg-terra-100',
  'bg-terra-200',
  'bg-terra-300',
  'bg-terra-400',
]

// 星期行标签（只标注一/三/五，其余留空对齐）
const WEEKDAY_LABELS = ['一', '', '三', '', '五', '', '']

// 格子尺寸（px）
const CELL = 12
const GAP = 3
const STEP = CELL + GAP

interface DayCell {
  date: string // YYYY-MM-DD
  amount: number // 当日支出（分）
  count: number // 当日笔数
  level: number // 0-4，-1 表示未来日期
  future: boolean
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ExpenseHeatmap({ transactions }: { transactions: Transaction[] }) {
  const [hovered, setHovered] = useState<{ x: number; y: number; cell: DayCell } | null>(null)

  const { weeks, monthLabels, monthCount } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayKey = toDateKey(today)

    // 默认窗口：近6个月，从5个月前的1号开始
    const defaultStart = new Date(today.getFullYear(), today.getMonth() - 5, 1)
    const defaultStartKey = toDateKey(defaultStart)

    // 找出最早的一笔支出（不晚于今天）；若晚于默认起点，则从该笔支出那天开始
    let firstExpenseKey: string | null = null
    for (const t of transactions) {
      if (t.type !== 'expense' || t.date > todayKey) continue
      if (!firstExpenseKey || t.date < firstExpenseKey) firstExpenseKey = t.date
    }

    let start = defaultStart
    if (firstExpenseKey && firstExpenseKey > defaultStartKey) {
      const [y, m, d] = firstExpenseKey.split('-').map(Number)
      start = new Date(y, m - 1, d)
    }

    const startWeek = new Date(start)
    startWeek.setDate(startWeek.getDate() - ((startWeek.getDay() + 6) % 7)) // 对齐周一

    // 实际覆盖的月份数（按起点月份计，上限6），用于头部文案
    const monthCount = Math.min(
      (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth()) + 1,
      6
    )

    // 每日支出汇总
    const daily = new Map<string, { amount: number; count: number }>()
    transactions.forEach(t => {
      if (t.type !== 'expense' || t.date > todayKey) return
      const prev = daily.get(t.date) || { amount: 0, count: 0 }
      prev.amount += t.amount
      prev.count += 1
      daily.set(t.date, prev)
    })
    const maxAmount = Array.from(daily.values()).reduce((m, v) => Math.max(m, v.amount), 0)

    const getLevel = (amount: number): number => {
      if (amount <= 0) return 0
      if (maxAmount <= 0) return 1
      const ratio = amount / maxAmount
      if (ratio <= 0.25) return 1
      if (ratio <= 0.5) return 2
      if (ratio <= 0.75) return 3
      return 4
    }

    // 按周切分格子
    const weeks: DayCell[][] = []
    const monthLabels: { col: number; label: string }[] = []
    const cursor = new Date(startWeek)
    let lastMonth = -1
    while (cursor <= today) {
      if (cursor.getMonth() !== lastMonth) {
        lastMonth = cursor.getMonth()
        monthLabels.push({ col: weeks.length, label: `${cursor.getMonth() + 1}月` })
      }
      const week: DayCell[] = []
      for (let i = 0; i < 7; i++) {
        const dateKey = toDateKey(cursor)
        const stat = daily.get(dateKey)
        const future = cursor > today
        week.push({
          date: dateKey,
          amount: future ? 0 : (stat?.amount || 0),
          count: future ? 0 : (stat?.count || 0),
          level: future ? -1 : getLevel(stat?.amount || 0),
          future,
        })
        cursor.setDate(cursor.getDate() + 1)
      }
      weeks.push(week)
    }
    // 相邻月份标签间隔不足 2 列时省略前者，避免文字重叠
    const spacedLabels = monthLabels.filter((m, i) => {
      const next = monthLabels[i + 1]
      return !next || next.col - m.col >= 2
    })
    return { weeks, monthLabels: spacedLabels, monthCount }
  }, [transactions])

  const gridWidth = weeks.length * STEP - GAP

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="flame" className="w-4 h-4 text-terra" />
          <h3 className="text-lg font-medium text-charcoal">支出热力图</h3>
        </div>
        <span className="text-sm text-charcoal-300">近{monthCount}个月</span>
      </div>

      <div className="overflow-x-auto">
        <div className="mx-auto w-fit" style={{ minWidth: gridWidth + 20 }}>
          {/* 月份标签行 */}
          <div className="flex">
            <div className="w-5 shrink-0" />
            <div className="relative h-4" style={{ width: gridWidth }}>
              {monthLabels.map(m => (
                <span
                  key={`${m.label}-${m.col}`}
                  className="absolute top-0 text-[10px] leading-4 text-charcoal-300 whitespace-nowrap"
                  style={{ left: m.col * STEP }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          {/* 热力网格 */}
          <div className="flex">
            <div className="w-5 shrink-0 flex flex-col pr-1.5" style={{ gap: GAP }}>
              {WEEKDAY_LABELS.map((label, i) => (
                <span
                  key={i}
                  className="text-[10px] leading-none text-charcoal-300 flex items-center justify-end"
                  style={{ height: CELL }}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="flex" style={{ gap: GAP }}>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                  {week.map(cell => (
                    <div
                      key={cell.date}
                      className={`rounded-[3px] ${cell.future ? 'bg-transparent' : LEVEL_CLASSES[cell.level]}`}
                      style={{ width: CELL, height: CELL }}
                      onMouseEnter={
                        cell.future
                          ? undefined
                          : e => {
                              const r = e.currentTarget.getBoundingClientRect()
                              setHovered({ x: r.left + r.width / 2, y: r.top, cell })
                            }
                      }
                      onMouseLeave={cell.future ? undefined : () => setHovered(null)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 图例 */}
      <div className="flex items-center justify-center gap-1.5 mt-3">
        <span className="text-xs text-charcoal-300">少</span>
        {LEVEL_CLASSES.map((cls, i) => (
          <span key={i} className={`w-3 h-3 rounded-[3px] ${cls}`} />
        ))}
        <span className="text-xs text-charcoal-300">多</span>
      </div>

      {/* 悬浮提示：日期 + 当日支出与笔数 */}
      {hovered && (
        <div
          className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full"
          style={{ left: hovered.x, top: hovered.y - 6 }}
        >
          <div className="bg-white border border-sand-200 rounded-lg px-3 py-1.5 whitespace-nowrap">
            <p className="text-xs text-charcoal-300">{formatDate(hovered.cell.date)}</p>
            <p className="text-sm font-medium text-charcoal tabular-nums">
              支出 ¥{formatMoney(hovered.cell.amount)}
              {hovered.cell.count > 0 && (
                <span className="font-normal text-charcoal-300"> · {hovered.cell.count} 笔</span>
              )}
            </p>
          </div>
        </div>
      )}
    </Card>
  )
}
