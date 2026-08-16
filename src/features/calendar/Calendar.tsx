import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { formatMoney } from '../../utils/format'
import { readableTextColor } from '../../utils/colors'
import { Transaction, RecurringIncome, RecurringExpense } from '../../types'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Wallet,
  CalendarClock,
} from 'lucide-react'
import Card from '../../components/ui/Card'
import Icon from '../../components/ui/Icon'

// ============================================
// 日历页：三月轮播视图（当月居中，两侧各露一半）+ 固定收支明细 + 当日账单
// ============================================

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// 固定收支规则项（收入/支出结构一致）
interface RecurringRule {
  id: string
  name: string
  amount: number
  frequency: string
  dayOfMonth?: number
  dayOfWeek?: number
  startDate: string
  endDate?: string
  isEnabled: boolean
  kind: 'income' | 'expense'
  categoryId: string
}

// 某天命中的一条固定收支
interface DayEvent {
  ruleId: string
  kind: 'income' | 'expense'
  name: string
  amount: number
  frequency: string // daily 项不逐格标记，改为按月汇总
}

// 每日固定项的按月汇总（左面板用，替代逐日刷屏）
interface DailySummary {
  ruleId: string
  kind: 'income' | 'expense'
  name: string
  amount: number
  totalDays: number // 本月命中天数
  bookedDays: number // 已入账天数（今天及以前）
  total: number // 本月合计（分）
}

// 日历格子的完整数据
interface DayCell {
  key: string
  day: number
  dateStr: string // YYYY-MM-DD（本地时区）
  weekday: number // 0 = 周日
  inMonth: boolean
  isToday: boolean
  isFuture: boolean
  income: number // 当日真实收入（分，含每日自动账单，用于汇总/悬浮）
  expense: number
  transactions: Transaction[]
  events: DayEvent[]
}

// 一个月的完整数据
interface MonthData {
  year: number
  month: number // 1-12
  label: string // 例：2026年8月
  cells: DayCell[] // 42 格含前后月补位
  byDate: Map<string, DayCell> // 仅当月日期
  summary: { income: number; expense: number; balance: number }
}

// 本地时区生成 YYYY-MM-DD（禁止 new Date('YYYY-MM-DD') 的 UTC 解析）
function ymdLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * 某日期是否命中固定收支规则（与服务端 shouldProcessToday 逻辑一致）
 * - monthly: getDate() === dayOfMonth（精确匹配，31 号在小月不触发）
 * - weekly:  getDay() === dayOfWeek（0 = 周日）
 * - yearly:  月 + 日 与 startDate 的月 + 日相同
 */
function matchesDay(rule: RecurringRule, date: Date, dateStr: string): boolean {
  if (!rule.isEnabled) return false
  if (rule.endDate && dateStr > rule.endDate) return false
  if (dateStr < rule.startDate) return false

  switch (rule.frequency) {
    case 'daily':
      return true
    case 'weekly':
      return date.getDay() === rule.dayOfWeek
    case 'monthly':
      return date.getDate() === rule.dayOfMonth
    case 'yearly': {
      const [, sm, sd] = rule.startDate.split('-').map(Number)
      return date.getMonth() + 1 === sm && date.getDate() === sd
    }
    default:
      return false
  }
}

// 构建某个月的数据（周日开头，含前后月补位格子）
function buildMonth(
  year: number,
  month: number,
  transactions: Transaction[],
  rules: RecurringRule[],
  todayStr: string,
): MonthData {
  const firstDay = new Date(year, month - 1, 1) // 本地时区
  const startOffset = firstDay.getDay() // 0 = 周日
  const daysInMonth = new Date(year, month, 0).getDate()

  // 当月交易按日期分组
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`
  const dailyTx = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (!t.date.startsWith(monthPrefix)) continue
    const list = dailyTx.get(t.date)
    if (list) list.push(t)
    else dailyTx.set(t.date, [t])
  }

  const cells: DayCell[] = []
  const byDate = new Map<string, DayCell>()
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7

  for (let i = 0; i < totalCells; i++) {
    const date = new Date(year, month - 1, i - startOffset + 1)
    const dateStr = ymdLocal(date)
    const inMonth = date.getMonth() + 1 === month

    const dayTx = inMonth ? dailyTx.get(dateStr) || [] : []
    const income = dayTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

    const events: DayEvent[] = inMonth
      ? rules
          .filter(rule => matchesDay(rule, date, dateStr))
          .map(rule => ({
            ruleId: rule.id,
            kind: rule.kind,
            name: rule.name,
            amount: rule.amount,
            frequency: rule.frequency,
          }))
      : []

    const cell: DayCell = {
      key: dateStr,
      day: date.getDate(),
      dateStr,
      weekday: date.getDay(),
      inMonth,
      isToday: dateStr === todayStr,
      isFuture: dateStr > todayStr,
      income,
      expense,
      transactions: dayTx,
      events,
    }
    cells.push(cell)
    if (inMonth) byDate.set(dateStr, cell)
  }

  const income = [...byDate.values()].reduce((s, c) => s + c.income, 0)
  const expense = [...byDate.values()].reduce((s, c) => s + c.expense, 0)

  return {
    year,
    month,
    label: `${year}年${month}月`,
    cells,
    byDate,
    summary: { income, expense, balance: income - expense },
  }
}

// ============================================
// 单个月历卡片（三个月共用，等大）
// ============================================
function MonthCalendar({
  data,
  side, // 'left' | 'center' | 'right'
  selectedDateStr,
  onCardClick,
  onSelectDate,
  onToday,
  onTitleClick,
}: {
  data: MonthData
  side: 'left' | 'center' | 'right'
  selectedDateStr: string
  onCardClick: () => void
  onSelectDate: (dateStr: string) => void
  onToday: () => void
  onTitleClick?: () => void
}) {
  const isCenter = side === 'center'
  return (
    <div
      className={`w-1/2 flex-shrink-0 px-0.5 aspect-square ${isCenter ? '' : 'opacity-60 hover:opacity-95 transition-opacity duration-200'}`}
      onClick={isCenter ? undefined : onCardClick}
    >
      <Card className="h-full w-full flex flex-col p-2 sm:p-3 overflow-hidden">
        {/* 标题行（中间卡标题可点击，弹年月选择器） */}
        <div className="flex items-center justify-between mb-1 px-0.5 flex-shrink-0">
          {isCenter ? (
            <button
              onClick={onTitleClick}
              title="选择月份"
              className="inline-flex items-center gap-0.5 text-sm sm:text-base font-display font-medium text-charcoal
                hover:text-brown transition-colors"
            >
              {data.label}
              <ChevronDown className="w-3.5 h-3.5 text-charcoal-300" />
            </button>
          ) : (
            <h2 className="text-sm sm:text-base font-display font-medium text-charcoal-400">
              {data.label}
            </h2>
          )}
          {isCenter && (
            <button
              onClick={onToday}
              className="px-2.5 py-0.5 text-xs font-medium rounded-md text-brown bg-brown-50
                hover:bg-brown-100 transition-colors"
            >
              今天
            </button>
          )}
        </div>

        {/* 星期表头 */}
        <div className="grid grid-cols-7 mb-[3px] flex-shrink-0">
          {WEEK_LABELS.map((w, i) => (
            <div
              key={w}
              className={`text-center text-[10px] font-medium py-[2px] ${
                i === 0 || i === 6 ? 'text-terra-400' : 'text-charcoal-300'
              }`}
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 grid-rows-6 gap-[3px] flex-1 min-h-0">
          {data.cells.map(cell => {
            if (!cell.inMonth) {
              return (
                <div
                  key={cell.key}
                  className="rounded-md bg-cream-50/40 select-none"
                />
              )
            }

            const isSelected = cell.dateStr === selectedDateStr
            // 每日项不逐格标记（否则满屏重复），只标工资/房租等按期固定收支
            const badgeEvents = cell.events.filter(ev => ev.frequency !== 'daily')
            return (
              <button
                key={cell.key}
                onClick={e => {
                  e.stopPropagation() // 侧边卡片点击=切换月份，日期点击仅选中
                  onSelectDate(cell.dateStr)
                }}
                title={[
                  cell.income > 0 ? `收入 +${formatMoney(cell.income)}` : null,
                  cell.expense > 0 ? `支出 -${formatMoney(cell.expense)}` : null,
                  ...badgeEvents.map(
                    ev => `${ev.name} ${ev.kind === 'income' ? '+' : '-'}${formatMoney(ev.amount)}${cell.isFuture ? '（预计）' : ''}`,
                  ),
                ]
                  .filter(Boolean)
                  .join('\n') || undefined}
                className={`h-full min-h-0 rounded-md p-[3px] sm:p-1 flex flex-col items-center overflow-hidden
                  text-center transition-colors cursor-pointer hover:bg-sand-100/70 active:bg-sand-100
                  ${isSelected
                    ? 'bg-sand-100 border border-brown-300'
                    : cell.isFuture
                      ? 'bg-cream-50 border border-transparent'
                      : 'bg-white border border-sand-200'}`}
              >
                {/* 日期数字：居中，今天 = 棕色实心圆（不加文字角标） */}
                <span
                  className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] flex-shrink-0
                    ${
                      cell.isToday
                        ? 'bg-brown text-white font-semibold'
                        : cell.isFuture
                          ? 'text-charcoal-400'
                          : 'text-charcoal'
                    }`}
                >
                  {cell.day}
                </span>

                <div className="flex-1 min-h-0" />

                {/* 固定收支圆点：底部统一锚点，整排对齐；实心=已入账 空心=预计（金额悬浮可见） */}
                <div className="flex items-center justify-center gap-[3px] h-[6px] flex-shrink-0">
                  {badgeEvents.slice(0, 3).map(ev => (
                    <span
                      key={ev.ruleId}
                      title={ev.name}
                      className={
                        ev.kind === 'income'
                          ? cell.isFuture
                            ? 'w-[6px] h-[6px] rounded-full border border-olive-400'
                            : 'w-[5px] h-[5px] rounded-full bg-olive-400'
                          : cell.isFuture
                            ? 'w-[6px] h-[6px] rounded-full border border-terra-400'
                            : 'w-[5px] h-[5px] rounded-full bg-terra-400'
                      }
                    />
                  ))}
                </div>
              </button>
            )
          })}
        </div>

      </Card>
    </div>
  )
}

// ============================================
// 日历主页面
// ============================================
export default function Calendar() {
  const transactions = useAppStore(state => state.transactions)
  const categories = useAppStore(state => state.categories)
  const recurringIncomes = useAppStore(state => state.recurringIncomes)
  const recurringExpenses = useAppStore(state => state.recurringExpenses)

  const now = new Date()
  const todayStr = ymdLocal(now)
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1) // 1-12
  const [selectedDateStr, setSelectedDateStr] = useState(todayStr) // 默认选中今天

  // 轮播滑动状态：-1 = 上月滑入，0 = 静止，+1 = 下月滑入
  const [slide, setSlide] = useState(0)
  // 瞬间跳转（无动画）标记
  const [noAnim, setNoAnim] = useState(false)
  const animatingRef = useRef(false)

  // 汇总固定收支规则（收入 + 支出 → 统一结构）
  const rules: RecurringRule[] = useMemo(() => {
    const fromIncome = recurringIncomes.map((r: RecurringIncome) => ({ ...r, kind: 'income' as const }))
    const fromExpense = recurringExpenses.map((r: RecurringExpense) => ({ ...r, kind: 'expense' as const }))
    return [...fromIncome, ...fromExpense]
  }, [recurringIncomes, recurringExpenses])

  // 三个月数据（上月 / 当月 / 下月）
  const { currMonth, prevMonth, nextMonth } = useMemo(() => {
    const prev = new Date(viewYear, viewMonth - 2, 1)
    const next = new Date(viewYear, viewMonth, 1)
    return {
      currMonth: buildMonth(viewYear, viewMonth, transactions, rules, todayStr),
      prevMonth: buildMonth(prev.getFullYear(), prev.getMonth() + 1, transactions, rules, todayStr),
      nextMonth: buildMonth(next.getFullYear(), next.getMonth() + 1, transactions, rules, todayStr),
    }
  }, [viewYear, viewMonth, transactions, rules, todayStr])

  // 选中日的账单数据（独立于主视图月份，切换月份不丢失选中）
  const selectedDay = useMemo(() => {
    const [y, m, d] = selectedDateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d) // 本地时区
    const dayTx = transactions.filter(t => t.date === selectedDateStr)
    const income = dayTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const events: DayEvent[] = rules
      .filter(rule => matchesDay(rule, date, selectedDateStr))
      .map(rule => ({
        ruleId: rule.id,
        kind: rule.kind,
        name: rule.name,
        amount: rule.amount,
        frequency: rule.frequency,
      }))
    return {
      dateStr: selectedDateStr,
      day: d,
      weekday: date.getDay(),
      transactions: dayTx,
      income,
      expense,
      events,
      isToday: selectedDateStr === todayStr,
      isFuture: selectedDateStr > todayStr,
    }
  }, [selectedDateStr, transactions, rules, todayStr])

  // 当月固定收支到账安排（左面板）：按日期项升序 + 每日项按月汇总
  const { scheduleItems, dailySummaries } = useMemo(() => {
    const items: (DayEvent & { dateStr: string; day: number; weekday: number; isFuture: boolean })[] = []
    const dailyMap = new Map<string, DailySummary>()
    for (const cell of currMonth.byDate.values()) {
      for (const ev of cell.events) {
        if (ev.frequency === 'daily') {
          const existing = dailyMap.get(ev.ruleId)
          if (existing) {
            existing.totalDays += 1
            existing.total += ev.amount
            if (!cell.isFuture) existing.bookedDays += 1
          } else {
            dailyMap.set(ev.ruleId, {
              ruleId: ev.ruleId,
              kind: ev.kind,
              name: ev.name,
              amount: ev.amount,
              totalDays: 1,
              bookedDays: cell.isFuture ? 0 : 1,
              total: ev.amount,
            })
          }
        } else {
          items.push({ ...ev, dateStr: cell.dateStr, day: cell.day, weekday: cell.weekday, isFuture: cell.isFuture })
        }
      }
    }
    items.sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    return {
      scheduleItems: items,
      dailySummaries: [...dailyMap.values()],
    }
  }, [currMonth])

  // 无动画瞬切到某月（用于轮播重置 / 今天按钮）
  const jumpTo = (year: number, month: number) => {
    setNoAnim(true)
    setSlide(0)
    setViewYear(year)
    setViewMonth(month)
    // 等浏览器渲染完无动画帧后再恢复动画能力
    requestAnimationFrame(() => requestAnimationFrame(() => setNoAnim(false)))
  }

  // 滑动切换：delta = -1 上月 / +1 下月（函数式更新，引用稳定，可安全用于键盘/触摸监听闭包）
  const slideTo = (delta: number) => {
    if (animatingRef.current) return
    setSlide(prev => {
      if (prev !== 0) return prev
      animatingRef.current = true
      return delta
    })
  }

  // 滑动动画结束：把滑入的月份设为当月，并瞬跳回基准位置（无缝轮播）
  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return
    if (slide === 0) {
      animatingRef.current = false
      return
    }
    const delta = slide
    const nd = new Date(viewYear, viewMonth - 1 + delta, 1)
    jumpTo(nd.getFullYear(), nd.getMonth() + 1)
    animatingRef.current = false
  }

  const goToday = () => {
    if (animatingRef.current) return
    const t = new Date()
    if (t.getFullYear() === viewYear && t.getMonth() + 1 === viewMonth) {
      setSelectedDateStr(todayStr)
      return
    }
    jumpTo(t.getFullYear(), t.getMonth() + 1)
    setSelectedDateStr(todayStr)
  }

  // 选中日期（不动月份）
  const selectDate = (dateStr: string) => setSelectedDateStr(dateStr)

  // ===== 年月快速选择器 =====
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(viewYear)
  const openPicker = () => {
    setPickerYear(viewYear)
    setPickerOpen(true)
  }
  const pickMonth = (year: number, month: number) => {
    setPickerOpen(false)
    if (year === viewYear && month === viewMonth) return
    jumpTo(year, month)
  }

  // 键盘 ←/→ 切月（日历页无输入框，全局监听安全）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') slideTo(-1)
      else if (e.key === 'ArrowRight') slideTo(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 触摸滑动切月（移动端手势）
  const touchStartX = useRef<number | null>(null)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) > 48) slideTo(dx < 0 ? 1 : -1) // 左滑下月，右滑上月
  }

  // 切换日期后，右面板滚动回顶
  const billScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    billScrollRef.current?.scrollTo({ top: 0 })
  }, [selectedDateStr])

  const getCategory = (id: string) => categories.find(c => c.id === id)
  const ruleById = (id: string) => rules.find(r => r.id === id)

  // 当日账单中要展示的固定收支：今天及以前已自动入账的（交易明细里已有）不再重复展示
  const billEvents = selectedDay.events.filter(ev => {
    if (!selectedDay.isFuture) {
      const autoNote = `自动${ev.kind === 'income' ? '收入' : '支出'} - ${ev.name}`
      if (selectedDay.transactions.some(t => t.note === autoNote)) return false
    }
    return true
  })

  return (
    <div className="animate-fade-in lg:h-[calc(100vh-4rem)] lg:flex lg:flex-col lg:overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold text-charcoal">日历</h1>
          <p className="text-sm text-charcoal-300 mt-1">
            每月资金节奏一览：日常收支、工资到账日与固定支出日
          </p>
        </div>

        {/* 当月汇总 */}
        <div className="flex items-center gap-4 text-sm tabular-nums">
          <span className="flex items-center gap-1.5 text-olive-500">
            <TrendingUp className="w-4 h-4" strokeWidth={1.5} />
            +{formatMoney(currMonth.summary.income)}
          </span>
          <span className="flex items-center gap-1.5 text-terra-500">
            <TrendingDown className="w-4 h-4" strokeWidth={1.5} />
            -{formatMoney(currMonth.summary.expense)}
          </span>
          <span className="flex items-center gap-1.5 text-charcoal">
            <Wallet className="w-4 h-4" strokeWidth={1.5} />
            结余 {currMonth.summary.balance >= 0 ? '+' : ''}{formatMoney(currMonth.summary.balance)}
          </span>
        </div>
      </div>

      {/* 三月轮播：当月居中完整，两侧各露一半（整体限宽居中） */}
      <div
        className="relative w-full max-w-3xl mx-auto flex-shrink-0"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* 年月快速选择器 */}
        {pickerOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setPickerOpen(false)} />
            <div className="absolute left-1/2 -translate-x-1/2 top-9 z-40 w-64 bg-white rounded-lg border border-sand-200 shadow-md p-3">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setPickerYear(y => y - 1)}
                  className="p-1 rounded-md text-charcoal-300 hover:text-brown hover:bg-sand-100 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-display font-medium text-charcoal">{pickerYear}年</span>
                <button
                  onClick={() => setPickerYear(y => y + 1)}
                  className="p-1 rounded-md text-charcoal-300 hover:text-brown hover:bg-sand-100 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                  const isCurrent = pickerYear === viewYear && m === viewMonth
                  const isThisMonth =
                    pickerYear === new Date().getFullYear() && m === new Date().getMonth() + 1
                  return (
                    <button
                      key={m}
                      onClick={() => pickMonth(pickerYear, m)}
                      className={`py-1.5 text-xs rounded-md transition-colors
                        ${isCurrent
                          ? 'bg-brown text-white font-medium'
                          : isThisMonth
                            ? 'text-brown font-medium border border-brown-200 hover:bg-brown-50'
                            : 'text-charcoal-300 hover:bg-sand-100 hover:text-charcoal'}`}
                    >
                      {m}月
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
        {/* 左右渐变遮罩，暗示两侧还有内容 */}
        <div className="absolute inset-y-0 left-0 w-10 z-10 pointer-events-none
          bg-gradient-to-r from-cream to-transparent" />
        <div className="absolute inset-y-0 right-0 w-10 z-10 pointer-events-none
          bg-gradient-to-l from-cream to-transparent" />

        {/* 左右切换箭头 */}
        <button
          onClick={() => slideTo(-1)}
          disabled={slide !== 0}
          title="上个月"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full
            bg-white border border-sand-200 flex items-center justify-center
            text-charcoal-300 hover:text-brown hover:border-brown-200
            disabled:opacity-40 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => slideTo(1)}
          disabled={slide !== 0}
          title="下个月"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full
            bg-white border border-sand-200 flex items-center justify-center
            text-charcoal-300 hover:text-brown hover:border-brown-200
            disabled:opacity-40 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* 轮播轨道：三张等宽卡片（各占容器一半），基准位移 -25% 使中间居中 */}
        <div className="overflow-hidden">
          <div
            className={`flex ${noAnim ? '' : 'transition-transform duration-300 ease-out'}`}
            style={{ transform: `translateX(${-25 - slide * 50}%)` }}
            onTransitionEnd={handleTransitionEnd}
          >
            <MonthCalendar
              data={prevMonth}
              side="left"
              selectedDateStr={selectedDateStr}
              onCardClick={() => slideTo(-1)}
              onSelectDate={dateStr => {
                setSelectedDateStr(dateStr)
                slideTo(-1)
              }}
              onToday={goToday}
            />
            <MonthCalendar
              data={currMonth}
              side="center"
              selectedDateStr={selectedDateStr}
              onCardClick={() => {}}
              onSelectDate={selectDate}
              onToday={goToday}
              onTitleClick={openPicker}
            />
            <MonthCalendar
              data={nextMonth}
              side="right"
              selectedDateStr={selectedDateStr}
              onCardClick={() => slideTo(1)}
              onSelectDate={dateStr => {
                setSelectedDateStr(dateStr)
                slideTo(1)
              }}
              onToday={goToday}
            />
          </div>
        </div>

        {/* 图例（轮播下方居中） */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 mt-2 text-[10px] text-charcoal-300">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-olive-400" />
            工资等固定收入到账日
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-terra-400" />
            房租等固定支出日
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full border border-charcoal-300" />
            空心 = 预计
          </span>
          <span>悬浮日期可看当日金额</span>
        </div>
      </div>

      {/* 下方双面板：固定收支明细 | 当日账单（弹性填满剩余高度，内部滚动） */}
      <div className="grid gap-4 lg:grid-cols-2 mt-4 flex-1 min-h-[280px] lg:min-h-0">
        {/* 左：固定收支到账日明细 */}
        <Card className="p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <div>
              <h3 className="text-base font-display font-medium text-charcoal">固定收支到账安排</h3>
              <p className="text-xs text-charcoal-300 mt-0.5">
                {currMonth.label}的工资到账与固定扣款日（点击查看当天账单）
              </p>
            </div>
            <CalendarClock className="w-4 h-4 text-charcoal-300 flex-shrink-0" strokeWidth={1.5} />
          </div>

          {scheduleItems.length > 0 || dailySummaries.length > 0 ? (
            <div className="space-y-1 flex-1 min-h-0 overflow-y-auto pr-1">
              {scheduleItems.map(item => {
                const isScheduled = !item.isFuture // 今天及以前视为已入账
                return (
                  <button
                    key={`${item.dateStr}-${item.ruleId}`}
                    onClick={() => selectDate(item.dateStr)}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors
                      ${item.dateStr === selectedDateStr ? 'bg-sand-100' : 'hover:bg-sand-100/70'}`}
                  >
                    {/* 日期块 */}
                    <div className="w-9 text-center flex-shrink-0">
                      <p className="text-sm font-medium text-charcoal leading-tight">{item.day}</p>
                      <p className="text-[10px] text-charcoal-300">{WEEK_LABELS[item.weekday]}</p>
                    </div>
                    {/* 名称与状态 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-charcoal truncate">{item.name}</p>
                      <p className={`text-[11px] ${item.kind === 'income' ? 'text-olive-500' : 'text-terra-500'}`}>
                        {item.kind === 'income' ? '固定收入' : '固定支出'}
                        <span className={`ml-1.5 ${isScheduled ? 'text-charcoal-300' : 'text-brown-300'}`}>
                          · {isScheduled ? '已入账' : '预计'}
                        </span>
                      </p>
                    </div>
                    {/* 金额 */}
                    <p
                      className={`text-sm font-medium tabular-nums flex-shrink-0 ${
                        item.kind === 'income' ? 'text-olive-500' : 'text-terra-500'
                      }`}
                    >
                      {item.kind === 'income' ? '+' : '-'}{formatMoney(item.amount)}
                    </p>
                  </button>
                )
              })}

              {/* 每日固定项：按月汇总为一行，不逐日刷屏 */}
              {dailySummaries.length > 0 && (
                <>
                  <p className="text-[10px] text-charcoal-300 pt-1.5 px-1">每日固定项（按月汇总）</p>
                  {dailySummaries.map(ds => {
                    const upcomingDays = ds.totalDays - ds.bookedDays
                    return (
                      <div
                        key={ds.ruleId}
                        className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg bg-sand-50"
                      >
                        <div className="w-9 text-center flex-shrink-0">
                          <p className="text-xs font-medium text-charcoal leading-tight">每天</p>
                          <p className="text-[10px] text-charcoal-300">{ds.totalDays}天</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-charcoal truncate">{ds.name}</p>
                          <p className={`text-[11px] ${ds.kind === 'income' ? 'text-olive-500' : 'text-terra-500'}`}>
                            每天 {ds.kind === 'income' ? '+' : '-'}{formatMoney(ds.amount)}
                            <span className="ml-1.5 text-charcoal-300">
                              · 已入账 {ds.bookedDays} 天{upcomingDays > 0 ? ` · 预计 ${upcomingDays} 天` : ''}
                            </span>
                          </p>
                        </div>
                        <p
                          className={`text-sm font-medium tabular-nums flex-shrink-0 ${
                            ds.kind === 'income' ? 'text-olive-500' : 'text-terra-500'
                          }`}
                        >
                          {ds.kind === 'income' ? '+' : '-'}{formatMoney(ds.total)}
                        </p>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-charcoal-300 py-6 text-center">
              本月暂无固定的工资到账或固定支出安排
            </p>
          )}
        </Card>

        {/* 右：当日账单 */}
        <Card className="p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <div>
              <h3 className="text-base font-display font-medium text-charcoal flex items-center gap-2">
                {selectedDay.day}日账单
                <span className="text-xs font-normal text-charcoal-300">
                  {selectedDay.dateStr.slice(0, 4)}年{parseInt(selectedDay.dateStr.slice(5, 7))}月 · {WEEKDAY_NAMES[selectedDay.weekday]}
                </span>
                {selectedDay.isToday && (
                  <span className="text-[10px] font-medium bg-brown text-white px-1.5 py-0.5 rounded">今天</span>
                )}
              </h3>
              <p className="text-xs text-charcoal-300 mt-0.5">该日所有账单记录</p>
            </div>
            <div className="text-sm tabular-nums flex-shrink-0">
              <span className="text-olive-500">+{formatMoney(selectedDay.income)}</span>
              <span className="text-terra-500 ml-2">-{formatMoney(selectedDay.expense)}</span>
            </div>
          </div>

          <div ref={billScrollRef} className="space-y-4 flex-1 min-h-0 overflow-y-auto pr-1">
            {/* 当日固定收支（已自动入账的不重复展示，交易明细里已有） */}
            {billEvents.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-charcoal-400 flex items-center gap-1">
                  <CalendarClock className="w-3.5 h-3.5" strokeWidth={1.5} />
                  固定收支{selectedDay.isFuture ? '（预计）' : ''}
                </p>
                {billEvents.map(ev => {
                  const rule = ruleById(ev.ruleId)
                  const category = getCategory(rule?.categoryId || '')
                  return (
                    <div
                      key={ev.ruleId}
                      className={`flex items-center justify-between rounded-lg px-3 py-2
                        ${ev.kind === 'income' ? 'bg-olive-50' : 'bg-terra-50'}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: category?.color || (ev.kind === 'income' ? '#6B8E5A' : '#C47A6C'),
                            color: readableTextColor(category?.color || (ev.kind === 'income' ? '#6B8E5A' : '#C47A6C')),
                          }}
                        >
                          <Icon name={category?.icon || (ev.kind === 'income' ? 'coins' : 'wallet')} className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm text-charcoal">{ev.name}</p>
                          <p className="text-xs text-charcoal-300">
                            {ev.kind === 'income' ? '固定收入' : '固定支出'}
                            {selectedDay.isFuture ? ' · 预计' + (ev.kind === 'income' ? '到账' : '扣款') : ''}
                          </p>
                        </div>
                      </div>
                      <p
                        className={`text-sm font-medium tabular-nums ${
                          ev.kind === 'income' ? 'text-olive-500' : 'text-terra-500'
                        }`}
                      >
                        {ev.kind === 'income' ? '+' : '-'}{formatMoney(ev.amount)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 当日交易明细 */}
            <div>
              <p className="text-xs font-medium text-charcoal-400 mb-2">
                交易明细（{selectedDay.transactions.length} 笔）
              </p>
              {selectedDay.transactions.length > 0 ? (
                <div className="space-y-1.5">
                  {selectedDay.transactions.map(t => {
                    const category = getCategory(t.categoryId)
                    const color = category?.color || '#8A8580'
                    return (
                      <div
                        key={t.id}
                        className="flex items-center justify-between rounded-lg bg-sand-50 px-3 py-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: color, color: readableTextColor(color) }}
                          >
                            <Icon name={category?.icon || 'coins'} className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-charcoal truncate">{category?.name || '未分类'}</p>
                            {t.note && (
                              <p className="text-xs text-charcoal-300 truncate max-w-[240px]">{t.note}</p>
                            )}
                          </div>
                        </div>
                        <p
                          className={`text-sm font-medium tabular-nums flex-shrink-0 ml-2 ${
                            t.type === 'income' ? 'text-olive-500' : 'text-terra-500'
                          }`}
                        >
                          {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount)}
                        </p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-charcoal-300 py-3 text-center">当天暂无交易记录</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
