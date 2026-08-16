// ============================================
// AI 工具：一句话创建 交易 / 周期性收支 / 攒钱目标
// 协议：AI 需要创建数据时，在回复中输出一行 FP_ACTION:{单行JSON}；
//       前端解析后由本地代码完成校验、默认值兜底与落库（AI 不直接写数据、不做资金计算）
// 信息不完整的处理约定：
//   关键信息缺失（金额/周期/名称）→ AI 不输出 FP_ACTION，直接追问；
//   非关键信息缺失（账户/分类/日期/备注）→ 本地默认值兜底并在回执中说明
// ============================================
import { Account, Category, TransactionType } from '../types'
import { useAppStore } from '../stores/appStore'
import { transactionRepo } from '../db/transactions'
import { recurringIncomeRepo } from '../db/recurringIncomes'
import { recurringExpenseRepo } from '../db/recurringExpenses'
import { goalRepo } from '../db/goals'
import { toast } from '../components/ui/Toast'
import { GOAL_ICON_OPTIONS } from '../components/ui/Icon'
import { SOFT_PALETTE } from './colors'
import { formatMoney, getToday, yuanToCent, calculatePercentage, getCurrentMonth, getRecentMonths } from './format'
import { findAccountId, findCategoryId, normalizeAmount, normalizeDate } from './smartEntry'

/** AI 产出的工具调用（仅是意图草稿，字段是否有效由执行器校验） */
export interface AiToolCall {
  tool: string
  args: Record<string, unknown>
}

/** 撤销引用：记录已创建数据的类型与 id */
export interface AiToolUndo {
  kind: 'transaction' | 'recurringIncome' | 'recurringExpense' | 'goal'
  id: string
}

export type AiToolResult =
  | { ok: true; title: string; details: string[]; historyNote: string; undo: AiToolUndo }
  | { ok: false; reason: string }

/** 可用图表名（AI 只表达「想展示什么图」，数据全部由本地计算） */
const CHART_NAMES = [
  'expense_breakdown',
  'income_breakdown',
  'monthly_trend',
  'budget_progress',
  'goal_progress',
] as const
type ChartName = (typeof CHART_NAMES)[number]

/** AI 请求展示的图表 */
export interface AiChartRequest {
  chart: ChartName
  month?: string // YYYY-MM（breakdown / budget 用，缺省当前月）
  months?: number // 趋势月数（trend 用，3-12，缺省 6）
}

/** 面板内嵌图表数据（金额均本地算好，单位：分；按 kind 分发渲染） */
export type ChatChartData =
  | {
      kind: 'breakdown'
      title: string
      total: number
      items: { name: string; value: number; color: string; percentage: number }[]
    }
  | {
      kind: 'trend'
      title: string
      points: { month: string; income: number; expense: number }[]
    }
  | {
      kind: 'budget'
      title: string
      month: string
      budget: number
      used: number
    }
  | {
      kind: 'goals'
      title: string
      items: { name: string; current: number; target: number; percentage: number; color: string; status: string }[]
    }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

// ---------- 协议解析 ----------

/**
 * 一次解析 AI 回复中的 FP_ACTION（创建数据）与 FP_CHART（展示图表）指令；
 * text 为剥离指令行后的说明文字。非法 JSON 一律当作普通文本。
 */
export function parseAiDirectives(reply: string): {
  action: AiToolCall | null
  chart: AiChartRequest | null
  text: string
} {
  let action: AiToolCall | null = null
  let chart: AiChartRequest | null = null
  let text = reply

  const mAction = text.match(/FP_ACTION:\s*(\{[^\n]*\})/)
  if (mAction && mAction.index !== undefined) {
    try {
      const obj = JSON.parse(mAction[1]) as unknown
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const o = obj as Record<string, unknown>
        if (typeof o.tool === 'string' && o.tool) {
          // 兼容 {"tool":..., ...字段} 与 {"tool":..., "args":{...}} 两种写法
          const args =
            o.args && typeof o.args === 'object' && !Array.isArray(o.args)
              ? (o.args as Record<string, unknown>)
              : o
          action = { tool: o.tool, args }
          text = text.slice(0, mAction.index) + text.slice(mAction.index + mAction[0].length)
        }
      }
    } catch {
      /* JSON 不合法时当作普通文本 */
    }
  }

  const mChart = text.match(/FP_CHART:\s*(\{[^\n]*\})/)
  if (mChart && mChart.index !== undefined) {
    try {
      const obj = JSON.parse(mChart[1]) as unknown
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const o = obj as Record<string, unknown>
        const name = str(o.chart)
        if ((CHART_NAMES as readonly string[]).includes(name)) {
          const monthRaw = str(o.month)
          const monthsRaw = typeof o.months === 'number' ? o.months : parseInt(str(o.months), 10)
          chart = {
            chart: name as ChartName,
            ...(monthRaw && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthRaw) ? { month: monthRaw } : {}),
            ...(name === 'monthly_trend' &&
              Number.isFinite(monthsRaw) &&
              monthsRaw >= 3 &&
              monthsRaw <= 12
              ? { months: Math.round(monthsRaw) }
              : {}),
          }
          text = text.slice(0, mChart.index) + text.slice(mChart.index + mChart[0].length)
        }
      }
    } catch {
      /* JSON 不合法时当作普通文本 */
    }
  }

  return { action, chart, text: text.trim() }
}

/** 按月聚合支出/收入分类构成（top5 + 其他）；无数据返回 null，面板不渲染图表 */
function computeBreakdown(req: AiChartRequest): ChatChartData | null {
  const month = req.month ?? getCurrentMonth()
  const { transactions, categories } = useAppStore.getState()
  const type: TransactionType = req.chart === 'income_breakdown' ? 'income' : 'expense'
  const breakdown: Record<string, number> = {}
  transactions
    .filter(t => t.type === type && t.date.startsWith(month))
    .forEach(t => {
      breakdown[t.categoryId] = (breakdown[t.categoryId] || 0) + t.amount
    })
  const total = Object.values(breakdown).reduce((s, v) => s + v, 0)
  if (total <= 0) return null

  const items = Object.entries(breakdown)
    .map(([cid, value]) => {
      const cat = categories.find(c => c.id === cid)
      return {
        name: cat?.name || '未分类',
        value,
        color: cat?.color || '#8A8580',
        percentage: calculatePercentage(value, total),
      }
    })
    .sort((a, b) => b.value - a.value)

  const top = items.slice(0, 5)
  const rest = items.slice(5)
  if (rest.length > 0) {
    const restValue = rest.reduce((s, i) => s + i.value, 0)
    top.push({ name: '其他', value: restValue, color: '#8A8580', percentage: calculatePercentage(restValue, total) })
  }

  return {
    kind: 'breakdown',
    title: `${month} ${type === 'income' ? '收入' : '支出'}构成`,
    total,
    items: top,
  }
}

/** 近 N 个月收支趋势（折线）；区间内完全无收支返回 null */
function computeTrend(req: AiChartRequest): ChatChartData | null {
  const { transactions } = useAppStore.getState()
  const months = req.months ?? 6
  const points = getRecentMonths(months).map(m => {
    const monthTxs = transactions.filter(t => t.date.startsWith(m))
    return {
      month: m,
      income: monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      expense: monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    }
  })
  if (points.every(p => p.income === 0 && p.expense === 0)) return null
  return { kind: 'trend', title: `近 ${months} 个月收支趋势`, points }
}

/** 预算执行进度；当月未设预算返回 null */
function computeBudget(req: AiChartRequest): ChatChartData | null {
  const { transactions, budgets } = useAppStore.getState()
  const month = req.month ?? getCurrentMonth()
  const budget = budgets.find(b => b.month === month)
  if (!budget || budget.totalBudget <= 0) return null
  const used = transactions
    .filter(t => t.type === 'expense' && t.date.startsWith(month))
    .reduce((s, t) => s + t.amount, 0)
  return { kind: 'budget', title: `${month} 预算执行`, month, budget: budget.totalBudget, used }
}

/** 攒钱目标进度（非已放弃，最多 5 个）；无目标返回 null */
function computeGoals(): ChatChartData | null {
  const { goals } = useAppStore.getState()
  const items = goals
    .filter(g => g.status !== 'abandoned')
    .slice(0, 5)
    .map(g => ({
      name: g.name,
      current: g.currentAmount,
      target: g.targetAmount,
      percentage: g.targetAmount > 0 ? calculatePercentage(g.currentAmount, g.targetAmount) : 0,
      color: g.color,
      status: g.status,
    }))
  if (items.length === 0) return null
  return { kind: 'goals', title: '攒钱目标进度', items }
}

/** 按图类型分发到对应本地聚合；无数据一律返回 null（面板不渲染） */
export function computeChatChart(req: AiChartRequest): ChatChartData | null {
  switch (req.chart) {
    case 'monthly_trend':
      return computeTrend(req)
    case 'budget_progress':
      return computeBudget(req)
    case 'goal_progress':
      return computeGoals()
    default:
      return computeBreakdown(req)
  }
}

/**
 * 本地图表意图兜底：模型偶尔不输出 FP_CHART，用关键词从用户问题识别图表意图。
 * 规则按优先级排列（预算优先于目标，避免「预算还差多少」误入目标图）；
 * 命中后仍走 computeChatChart，无数据不出图，误触发代价低。
 */
const CHART_INTENT_RULES: [ChartName, RegExp][] = [
  ['monthly_trend', /趋势|最近(几|一|两|三|四|五|六|七|八|九|十|多)?个?月|近几?月|收支变化|(花|花销|支出)[^。？!！]{0,8}(多了|少了|变多|变少)/],
  ['budget_progress', /预算|够不够花|还能花多少|超支/],
  ['income_breakdown', /收入(来源|构成|占比|结构)|钱从哪/],
  ['expense_breakdown', /花哪|花去|花在|花销|消费(结构|构成|占比)|支出(结构|构成|占比)|花最多|大头/],
  ['goal_progress', /目标|攒钱|攒到|攒了|想买|离.{0,12}还差|还差多(少|远)/],
]

/** 从用户问题文本识别图表意图；命中返回图表请求，否则 null */
export function detectChartIntent(question: string): AiChartRequest | null {
  const q = question.trim()
  for (const [chart, re] of CHART_INTENT_RULES) {
    if (re.test(q)) {
      return chart === 'monthly_trend' ? { chart, months: 6 } : { chart }
    }
  }
  return null
}

// ---------- 提示词 ----------

/** 构建注入 system prompt 的工具说明（含分类/账户列表与默认值规则） */
export function buildToolPromptSection(categories: Category[], accounts: Account[], today: string): string {
  const expenseNames = categories.filter(c => c.type === 'expense').map(c => c.name).join('、')
  const incomeNames = categories.filter(c => c.type === 'income').map(c => c.name).join('、')
  const accountNames = accounts.map(a => (a.isFrozen ? `${a.name}（已冻结，禁止作为支出/扣款账户）` : a.name)).join('、')
  return [
    '',
    '你还能直接帮用户创建数据：用户明确表达「记一笔/记账/添加/创建/我想攒钱买」等意图时，在回复第一行输出「FP_ACTION:{单行JSON}」，随后换行附一句简短说明（讲清用了哪些默认值）。可用工具：',
    '1. 记一笔账：FP_ACTION:{"tool":"create_transaction","type":"expense或income","amount":金额元数字,"categoryName":"","accountName":"","date":"YYYY-MM-DD","note":"不超过15字"}',
    '2. 周期性收入：FP_ACTION:{"tool":"create_recurring_income","name":"如 工资","amount":金额元数字,"frequency":"daily或weekly或monthly或yearly","dayOfMonth":1到31,"dayOfWeek":0到6,"categoryName":"","accountName":"","note":""}',
    '3. 周期性支出：FP_ACTION:{"tool":"create_recurring_expense","name":"如 房租","amount":金额元数字,"frequency":"daily或weekly或monthly或yearly","dayOfMonth":1到31,"dayOfWeek":0到6,"categoryName":"","accountName":"","note":""}',
    '4. 攒钱目标（想买的东西）：FP_ACTION:{"tool":"create_goal","name":"目标名","targetAmount":金额元数字}',
    '工具规则：',
    '- 只有用户明确要创建时才输出 FP_ACTION；咨询、假设（如「如果我花30会怎样」）、提问一律正常文字回答，禁止输出 FP_ACTION',
    '- 关键信息缺失时不要输出 FP_ACTION，直接追问：记账缺金额；周期收支缺金额或周期；目标缺名称或目标金额',
    '- 用户没说明的字段填空字符串或不填：分类按描述从列表选最贴切的，选不出留空（系统兜底）；账户没提留空（默认「其他」）；日期没提填今天；周期收支没说几号默认每月1号、周几默认周一；说明文字里告知用户用了哪些默认值',
    `- 今天是 ${today}，「昨天」「上周五」等相对日期换算为具体日期后再填`,
    '- 一次只创建一笔；用户一句话含多笔时先确认再逐笔创建；创建的金额以用户原话为准',
    '图表（数据由系统计算，你只指定图类型与参数，不用提供数字）：聊到以下任一主题就默认在回复第一行输出对应 FP_CHART:{单行JSON}，再配简短文字——用户没说不要图，能给图就给图，别只给干巴巴的数字，哪怕用户只是随口一问；月份没提用当前月份；与账、钱、数据完全无关的闲聊才不要输出 FP_CHART：',
    '- 钱花哪去了 / 各类支出或收入占比构成：FP_CHART:{"chart":"expense_breakdown","month":"YYYY-MM"}；收入构成用 income_breakdown',
    '- 最近花钱多了还是少了 / 近几个月收支变化：FP_CHART:{"chart":"monthly_trend","months":6}',
    '- 预算还剩多少 / 钱够不够花：FP_CHART:{"chart":"budget_progress","month":"YYYY-MM"}',
    '- 目标攒到哪了 / 离想买的东西还差多远：FP_CHART:{"chart":"goal_progress"}',
    '示例（照这个格式来，指令必须在第一行、单独一行）：',
    `用户「我的攒钱目标攒到哪了」→ 你：FP_CHART:{"chart":"goal_progress"} 换行后一两句点评`,
    `用户「这个月钱都花哪去了」→ 你：FP_CHART:{"chart":"expense_breakdown","month":"${today.slice(0, 7)}"} 换行后一两句点评`,
    `用户「最近花钱是不是变多了」→ 你：FP_CHART:{"chart":"monthly_trend","months":6} 换行后一两句点评`,
    `支出分类：${expenseNames || '（空）'}`,
    `收入分类：${incomeNames || '（空）'}`,
    `账户：${accountNames || '（空）'}`,
  ].join('\n')
}

// ---------- 执行器 ----------

/** 分类兜底：优先「其他支出/其他收入」，再「未分类」，再同类型第一个 */
function fallbackCategoryId(categories: Category[], type: TransactionType): string {
  const named = categories.find(
    c => c.type === type && c.name === (type === 'expense' ? '其他支出' : '其他收入')
  )
  if (named) return named.id
  const unsorted = categories.find(c => c.type === type && c.name === '未分类')
  if (unsorted) return unsorted.id
  return categories.find(c => c.type === type)?.id || ''
}

/** 账户兜底：优先「其他」，再第一个启用账户（冻结账户不可动，一律跳过） */
function fallbackAccountId(accounts: Account[]): string {
  const usable = accounts.filter(a => !a.isFrozen)
  return (usable.find(a => a.name === '其他') || usable.find(a => a.status === 'active') || usable[0])?.id || ''
}

async function execCreateTransaction(args: Record<string, unknown>): Promise<AiToolResult> {
  const { categories, accounts, refreshTransactions, refreshAccounts } = useAppStore.getState()
  const amount = normalizeAmount(args.amount)
  if (Number.isNaN(amount)) return { ok: false, reason: '金额缺失或无效' }
  const type: TransactionType = args.type === 'income' ? 'income' : 'expense'

  let categoryId = findCategoryId(str(args.categoryName), categories, type)
  let catLabel = ''
  if (!categoryId) {
    categoryId = fallbackCategoryId(categories, type)
    if (!categoryId) return { ok: false, reason: '没有可用分类，请先到设置页添加' }
    catLabel = '（未说明，已默认）'
  }

  let accountId = findAccountId(str(args.accountName), accounts)
  let accLabel = ''
  if (!accountId) {
    accountId = fallbackAccountId(accounts)
    if (!accountId) return { ok: false, reason: '没有可用账户，请先到账户管理添加' }
    accLabel = '（未说明，已默认）'
  }

  // 冻结账户（如“老婆本”）不能作为支出账户，与表单限制保持一致
  const matchedAccount = accounts.find(a => a.id === accountId)
  if (type === 'expense' && matchedAccount?.isFrozen) {
    return { ok: false, reason: `「${matchedAccount.name}」已冻结，不能从中支出，请换一个账户` }
  }

  const today = getToday()
  const date = normalizeDate(args.date, today)
  const dateLabel = date === today && !str(args.date) ? '（未说明，按今天）' : ''
  const note = str(args.note).slice(0, 30)
  const cents = yuanToCent(amount)

  const id = await transactionRepo.create({
    type,
    amount: cents,
    categoryId,
    accountId,
    date,
    note: note || undefined,
  })
  await refreshTransactions()
  await refreshAccounts()
  toast(`AI 已记录${type === 'income' ? '收入' : '支出'} ${formatMoney(cents)}`, 'success')

  const cat = categories.find(c => c.id === categoryId)?.name || ''
  const acc = accounts.find(a => a.id === accountId)?.name || ''
  return {
    ok: true,
    title: `已记录${type === 'income' ? '收入' : '支出'}`,
    details: [
      `金额：${formatMoney(cents)}`,
      `分类：${cat}${catLabel}`,
      `账户：${acc}${accLabel}`,
      `日期：${date}${dateLabel}`,
      ...(note ? [`备注：${note}`] : []),
    ],
    historyNote: `（系统已执行：记录${type === 'income' ? '收入' : '支出'} ${formatMoney(cents)}，${cat}/${acc}，${date}）`,
    undo: { kind: 'transaction', id },
  }
}

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const
type Frequency = (typeof FREQUENCIES)[number]
const FREQ_LABEL: Record<Frequency, string> = { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' }

/** 整数入参校验：不在区间内取 fallback */
function intIn(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(str(v), 10)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}

async function execCreateRecurring(
  args: Record<string, unknown>,
  kind: 'recurringIncome' | 'recurringExpense'
): Promise<AiToolResult> {
  const { categories, accounts, refreshRecurringIncomes, refreshRecurringExpenses } = useAppStore.getState()
  const amount = normalizeAmount(args.amount)
  if (Number.isNaN(amount)) return { ok: false, reason: '金额缺失或无效' }
  const name = str(args.name).slice(0, 20)
  if (!name) return { ok: false, reason: '缺少名称（如 工资/房租）' }

  const freqRaw = str(args.frequency).toLowerCase()
  const frequency: Frequency = (FREQUENCIES as readonly string[]).includes(freqRaw)
    ? (freqRaw as Frequency)
    : 'monthly'
  const freqDefaulted = freqRaw !== frequency

  const type: TransactionType = kind === 'recurringIncome' ? 'income' : 'expense'
  let categoryId = findCategoryId(str(args.categoryName), categories, type)
  let catLabel = ''
  if (!categoryId) {
    categoryId = fallbackCategoryId(categories, type)
    if (!categoryId) return { ok: false, reason: '没有可用分类，请先到设置页添加' }
    catLabel = '（未说明，已默认）'
  }
  let accountId = findAccountId(str(args.accountName), accounts)
  let accLabel = ''
  if (!accountId) {
    accountId = fallbackAccountId(accounts)
    if (!accountId) return { ok: false, reason: '没有可用账户，请先到账户管理添加' }
    accLabel = '（未说明，已默认）'
  }
  // 周期支出到期会自动扣款，同样不允许落在冻结账户上
  if (kind === 'recurringExpense') {
    const matchedAccount = accounts.find(a => a.id === accountId)
    if (matchedAccount?.isFrozen) {
      return { ok: false, reason: `「${matchedAccount.name}」已冻结，不能从中扣款，请换一个账户` }
    }
  }

  const today = getToday()
  const cents = yuanToCent(amount)
  const dayOfMonth = intIn(args.dayOfMonth, 1, 31, 1)
  const dayOfWeek = intIn(args.dayOfWeek, 0, 6, 1)
  const note = str(args.note).slice(0, 30)
  const dayDefaulted =
    (frequency === 'monthly' || frequency === 'yearly') && intIn(args.dayOfMonth, 1, 31, -1) === -1
      ? '，几号未说明默认1号'
      : frequency === 'weekly' && intIn(args.dayOfWeek, 0, 6, -1) === -1
        ? '，周几未说明默认周一'
        : ''

  const data = {
    name,
    amount: cents,
    frequency,
    ...(frequency === 'monthly' || frequency === 'yearly' ? { dayOfMonth } : {}),
    ...(frequency === 'weekly' ? { dayOfWeek } : {}),
    accountId,
    categoryId,
    startDate: today,
    isEnabled: true,
    note: note || undefined,
  }

  const id =
    kind === 'recurringIncome'
      ? await recurringIncomeRepo.create(data)
      : await recurringExpenseRepo.create(data)
  if (kind === 'recurringIncome') await refreshRecurringIncomes()
  else await refreshRecurringExpenses()
  const label = `${FREQ_LABEL[frequency]}${
    frequency === 'monthly' || frequency === 'yearly' ? `${dayOfMonth}号` : frequency === 'weekly' ? `周${'日一二三四五六'[dayOfWeek]}` : ''
  }`
  toast(`AI 已添加周期性${kind === 'recurringIncome' ? '收入' : '支出'}「${name}」`, 'success')

  const cat = categories.find(c => c.id === categoryId)?.name || ''
  const acc = accounts.find(a => a.id === accountId)?.name || ''
  return {
    ok: true,
    title: `已添加周期性${kind === 'recurringIncome' ? '收入' : '支出'}`,
    details: [
      `名称：${name}`,
      `金额：${formatMoney(cents)}`,
      `周期：${label}${freqDefaulted ? '（未说明，按每月）' : ''}${dayDefaulted}`,
      `分类：${cat}${catLabel}`,
      `账户：${acc}${accLabel}`,
      `起始日期：${today}（未说明，按今天）`,
      ...(note ? [`备注：${note}`] : []),
    ],
    historyNote: `（系统已执行：添加周期性${kind === 'recurringIncome' ? '收入' : '支出'}「${name}」${label} ${formatMoney(cents)}，${cat}/${acc}）`,
    undo: { kind, id },
  }
}

async function execCreateGoal(args: Record<string, unknown>): Promise<AiToolResult> {
  const { refreshGoals } = useAppStore.getState()
  const name = str(args.name).slice(0, 20)
  if (!name) return { ok: false, reason: '缺少目标名称' }
  const target = normalizeAmount(args.targetAmount)
  if (Number.isNaN(target)) return { ok: false, reason: '目标金额缺失或无效' }
  const cents = yuanToCent(target)

  const id = await goalRepo.create({
    name,
    targetAmount: cents,
    currentAmount: 0,
    icon: GOAL_ICON_OPTIONS[0],
    color: SOFT_PALETTE[0],
    status: 'active',
  })
  await refreshGoals()
  toast(`AI 已创建攒钱目标「${name}」`, 'success')

  return {
    ok: true,
    title: '已创建攒钱目标',
    details: [
      `名称：${name}`,
      `目标金额：${formatMoney(cents)}`,
      `已存：${formatMoney(0)}`,
      '可到「想买的东西」页面存钱或设置截止日期',
    ],
    historyNote: `（系统已执行：创建攒钱目标「${name}」目标 ${formatMoney(cents)}，已存 0）`,
    undo: { kind: 'goal', id },
  }
}

/** 执行 AI 工具调用：所有校验与默认值都在本地完成，异常一律转为失败结果 */
export async function executeAiTool(call: AiToolCall): Promise<AiToolResult> {
  try {
    switch (call.tool) {
      case 'create_transaction':
        return await execCreateTransaction(call.args)
      case 'create_recurring_income':
        return await execCreateRecurring(call.args, 'recurringIncome')
      case 'create_recurring_expense':
        return await execCreateRecurring(call.args, 'recurringExpense')
      case 'create_goal':
        return await execCreateGoal(call.args)
      default:
        return { ok: false, reason: `不支持的操作「${call.tool}」` }
    }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : '创建失败' }
  }
}

/** 撤销一次工具创建（删除对应记录并刷新） */
export async function undoAiTool(u: AiToolUndo): Promise<void> {
  const s = useAppStore.getState()
  if (u.kind === 'transaction') {
    await transactionRepo.delete(u.id)
    await s.refreshTransactions()
    await s.refreshAccounts()
  } else if (u.kind === 'recurringIncome') {
    await recurringIncomeRepo.delete(u.id)
    await s.refreshRecurringIncomes()
  } else if (u.kind === 'recurringExpense') {
    await recurringExpenseRepo.delete(u.id)
    await s.refreshRecurringExpenses()
  } else if (u.kind === 'goal') {
    await goalRepo.delete(u.id)
    await s.refreshGoals()
  }
  toast('已撤销该记录', 'info')
}
