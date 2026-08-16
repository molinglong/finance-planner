import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, ArrowUp, PanelRightClose, Trash2, Brain, ChevronDown, CheckCircle2, Loader2, MessageCircle, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useAiPanelStore, type AiHandoffCard } from '../../stores/aiPanelStore'
import { getCurrentMonth, formatMoney, calculatePercentage, getToday } from '../../utils/format'
import {
  computeAccountBalances,
  computeAvgDailyExpense,
  computeMonthlySavable,
} from '../../utils/purchaseAnalysis'
import { fetchAiConfig, fetchSearchConfig, sendAiChat, type AiChatMessage } from '../../api/ai'
import {
  parseAiDirectives,
  executeAiTool,
  undoAiTool,
  buildToolPromptSection,
  computeChatChart,
  detectChartIntent,
  type AiToolResult,
  type ChatChartData,
} from '../../utils/aiTools'
import { chartColor } from '../../utils/colors'
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

const DEEP_THINKING_STORAGE_KEY = 'ai-panel-deep-thinking'

function readDeepThinkingFromStorage(): boolean {
  try {
    return localStorage.getItem(DEEP_THINKING_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/** 面板消息：reasoning/elapsedMs/action/card 仅用于展示，不回传给 AI（执行摘要走 historyExtra） */
interface PanelMessage {
  role: 'user' | 'assistant'
  content: string
  /** 交接卡片（灵魂拷问→细聊，仅展示） */
  card?: AiHandoffCard
  reasoning?: string
  elapsedMs?: number
  /** 工具执行回执卡片 */
  action?: AiToolResult & { undone?: boolean }
  /** 内嵌图表（数据本地计算，仅展示） */
  chart?: ChatChartData
  /** 报价时效性提示条（回复含联网搜索报价时显示） */
  priceNote?: boolean
  /** 追加到回传历史的执行摘要，让后续对话知道已创建过什么 */
  historyExtra?: string
}

/** 深度思考过程折叠块（默认收起，点击展开） */
function ThinkingBlock({ reasoning, elapsedMs }: { reasoning: string; elapsedMs?: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs text-charcoal-300 hover:text-brown transition-colors"
      >
        <Brain className="w-3 h-3" strokeWidth={1.5} />
        <span>
          已深度思考{typeof elapsedMs === 'number' ? `（${(elapsedMs / 1000).toFixed(1)}s）` : ''}
        </span>
        <ChevronDown
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.5}
        />
      </button>
      {open && (
        <div
          className="mt-1 text-xs text-charcoal-300 leading-relaxed whitespace-pre-wrap break-words
            max-h-64 overflow-y-auto"
        >
          {reasoning}
        </div>
      )}
    </div>
  )
}

/** 工具执行回执卡片：明细 + 一键撤销 */
function ActionCard({ result, onUndo }: { result: AiToolResult & { undone?: boolean }; onUndo?: () => void }) {
  if (!result.ok) {
    return <div className="mt-1.5 text-xs text-terra">创建未完成：{result.reason}，请补充信息后再试</div>
  }
  return (
    <div className="mt-1.5 rounded-lg bg-white border border-sand-200 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs font-medium text-charcoal min-w-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-olive flex-shrink-0" strokeWidth={1.5} />
          {result.title}
        </span>
        {result.undone ? (
          <span className="text-xs text-charcoal-300 flex-shrink-0">已撤销</span>
        ) : (
          <button onClick={onUndo} className="text-xs text-terra hover:underline flex-shrink-0">
            撤销
          </button>
        )}
      </div>
      <div className="mt-1 space-y-0.5 text-xs text-charcoal-300">
        {result.details.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
    </div>
  )
}

/** 图表卡片外框（与工具回执卡片同风格） */
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-1.5 rounded-lg bg-white border border-sand-200 px-3 py-2">
      <p className="text-xs font-medium text-charcoal">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  )
}

/** 支出/收入构成：迷你环形图 + 图例，悬浮扇区/图例时中心联动（与仪表盘环形图同交互） */
function BreakdownBlock({ data }: { data: Extract<ChatChartData, { kind: 'breakdown' }> }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const active = activeIndex !== null ? data.items[activeIndex] : undefined
  return (
    <ChartCard title={data.title}>
      <div className="flex items-center gap-2.5">
        <div className="relative w-24 h-24 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.items}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={46}
                paddingAngle={data.items.length > 1 ? 2 : 0}
                dataKey="value"
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {data.items.map((it, i) => (
                  <Cell
                    key={i}
                    fill={chartColor(it.color)}
                    opacity={activeIndex === null || activeIndex === i ? 1 : 0.45}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {active ? (
              <>
                <p className="text-[10px] text-charcoal-300">{active.name} {active.percentage}%</p>
                <p className="text-xs font-semibold text-charcoal tabular-nums">¥{formatMoney(active.value)}</p>
              </>
            ) : (
              <>
                <p className="text-[10px] text-charcoal-300">合计</p>
                <p className="text-xs font-semibold text-charcoal tabular-nums">¥{formatMoney(data.total)}</p>
              </>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          {data.items.map((it, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-xs cursor-default"
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: chartColor(it.color) }} />
              <span className="text-charcoal-300 truncate flex-1">{it.name}</span>
              <span className="text-charcoal tabular-nums">¥{formatMoney(it.value)}</span>
              <span className="text-charcoal-300 tabular-nums w-8 text-right">{it.percentage}%</span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  )
}

/** 近 N 月收支趋势：收入/支出双折线 */
function TrendBlock({ data }: { data: Extract<ChatChartData, { kind: 'trend' }> }) {
  return (
    <ChartCard title={data.title}>
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.points} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#EDE5D8" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => `${Number(m.slice(5))}月`}
              tick={{ fontSize: 10, fill: '#8A8580' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(v: number) => `${Math.round(v / 100)}`}
              tick={{ fontSize: 10, fill: '#8A8580' }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              formatter={(value, name) => [`¥${formatMoney(Number(value))}`, String(name)]}
              labelFormatter={(m: string) => `${m}`}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E0D5C4' }}
            />
            <Line type="monotone" dataKey="income" name="收入" stroke="#6B8E5A" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="expense" name="支出" stroke="#C47A6C" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-3 mt-1 text-[10px] text-charcoal-300">
        <span className="flex items-center gap-1">
          <span className="w-2 h-0.5 bg-olive rounded-full" />
          收入
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-0.5 bg-terra rounded-full" />
          支出
        </span>
      </div>
    </ChartCard>
  )
}

/** 预算执行进度条：颜色按使用率分档（<80% 绿 / 80-100% 棕 / 超支红） */
function BudgetBlock({ data }: { data: Extract<ChatChartData, { kind: 'budget' }> }) {
  const pct = data.budget > 0 ? calculatePercentage(data.used, data.budget) : 0
  const remain = data.budget - data.used
  const barColor = pct > 100 ? 'bg-terra' : pct >= 80 ? 'bg-brown' : 'bg-olive'
  return (
    <ChartCard title={data.title}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-charcoal-300">已用 {pct}%</span>
        <span className={remain >= 0 ? 'text-olive' : 'text-terra'}>
          {remain >= 0 ? `剩余 ¥${formatMoney(remain)}` : `超支 ¥${formatMoney(-remain)}`}
        </span>
      </div>
      <div className="h-2.5 bg-sand-100 rounded-full mt-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="flex justify-between mt-1 text-xs text-charcoal-300">
        <span>预算 ¥{formatMoney(data.budget)}</span>
        <span className="text-charcoal tabular-nums">已用 ¥{formatMoney(data.used)}</span>
      </div>
    </ChartCard>
  )
}

/** 攒钱目标进度：每目标一条进度线（目标色取色） */
function GoalsBlock({ data }: { data: Extract<ChatChartData, { kind: 'goals' }> }) {
  return (
    <ChartCard title={data.title}>
      <div className="space-y-2">
        {data.items.map((g, i) => (
          <div key={i}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-charcoal-300 truncate flex-1">
                {g.name}
                {g.status === 'completed' ? ' · 已完成' : ''}
              </span>
              <span className="text-charcoal-300 tabular-nums whitespace-nowrap">
                ¥{formatMoney(g.current)} / ¥{formatMoney(g.target)}
              </span>
              <span className="text-charcoal tabular-nums w-9 text-right">{g.percentage}%</span>
            </div>
            <div className="h-1.5 bg-sand-100 rounded-full mt-1 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, g.percentage)}%`, backgroundColor: chartColor(g.color) }}
              />
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}

/** 内嵌图表：按数据 kind 分发到对应渲染块 */
function ChartBlock({ data }: { data: ChatChartData }) {
  if (data.kind === 'trend') return <TrendBlock data={data} />
  if (data.kind === 'budget') return <BudgetBlock data={data} />
  if (data.kind === 'goals') return <GoalsBlock data={data} />
  return <BreakdownBlock data={data} />
}

/** 灵魂拷问→细聊的交接卡片：物品档案 + 结论徽章 + 问答摘要（替代文字墙） */
function HandoffCardBlock({ data }: { data: AiHandoffCard }) {
  const toneClass =
    data.verdict?.tone === 'recommend'
      ? 'bg-olive-50 text-olive'
      : data.verdict?.tone === 'avoid'
        ? 'bg-terra-50 text-terra'
        : 'bg-sand-100 text-brown'
  return (
    <div className="w-full rounded-lg bg-white border border-sand-200 px-3 py-2.5 text-left">
      <div className="flex items-center gap-1.5 text-[10px] text-charcoal-300">
        <MessageCircle className="w-3 h-3" strokeWidth={1.5} />
        灵魂拷问 · 转来细聊
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <span className="text-sm font-medium text-charcoal">{data.goalName}</span>
        <span className="text-xs text-charcoal-300 tabular-nums">¥{formatMoney(data.price)}</span>
        {data.source && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sand-100 text-charcoal-300">{data.source}</span>
        )}
        {data.verdict && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${toneClass}`}>
            {data.verdict.label} · 吃灰率 {data.verdict.dustRate}%
          </span>
        )}
      </div>
      {data.reason && <p className="mt-1 text-[11px] text-charcoal-400 leading-relaxed">心动理由：{data.reason}</p>}
      {data.qa.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {data.qa.map((p, i) => (
            <div key={i} className="flex items-baseline gap-1.5 text-xs min-w-0">
              <span className="text-charcoal-300 truncate max-w-[45%] flex-shrink">{p.q || '补充'}</span>
              <span className="text-charcoal-300 flex-shrink-0">→</span>
              <span className="text-charcoal truncate flex-1 min-w-0">{p.a}</span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 pt-1.5 border-t border-sand-100 text-xs text-charcoal-400 leading-relaxed">{data.question}</p>
    </div>
  )
}

/** 空状态快捷提问 */
const QUICK_QUESTIONS = [
  '分析我本月的消费结构',
  '按现在的节奏，每月能存下钱吗？',
  '我的预算执行得怎么样？',
]

export default function AiPanel() {
  const transactions = useAppStore(state => state.transactions)
  const categories = useAppStore(state => state.categories)
  const goals = useAppStore(state => state.goals)
  const accounts = useAppStore(state => state.accounts)
  const budgets = useAppStore(state => state.budgets)
  const recurringIncomes = useAppStore(state => state.recurringIncomes)
  const recurringExpenses = useAppStore(state => state.recurringExpenses)

  // AI 未配置时整个面板隐藏（与智能记账/购买分析入口一致）；搜索已配置时空状态文案提示可查价
  // （防幻觉报价规范由服务端统一注入 system 消息，前端不用管）
  const [aiReady, setAiReady] = useState(false)
  const [searchReady, setSearchReady] = useState(false)
  // 收起态与外部投喂消息提升到 aiPanelStore，供其他组件展开面板并交接话题
  const collapsed = useAiPanelStore(s => s.collapsed)
  const expand = useAiPanelStore(s => s.expand)
  const collapse = useAiPanelStore(s => s.collapse)
  const pending = useAiPanelStore(s => s.pending)
  const clearPending = useAiPanelStore(s => s.clearPending)
  const [deepThinking, setDeepThinking] = useState<boolean>(readDeepThinkingFromStorage)
  const [chat, setChat] = useState<PanelMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchAiConfig()
      .then(cfg => setAiReady(cfg.configured))
      .catch(() => setAiReady(false))
    fetchSearchConfig()
      .then(cfg => setSearchReady(cfg.configured))
      .catch(() => setSearchReady(false))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(DEEP_THINKING_STORAGE_KEY, String(deepThinking))
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }, [deepThinking])

  // 滚动到最新消息
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [chat, busy])

  // 输入框随内容自动伸缩（约 4 行封顶，超出内部滚动）
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const max = 112
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  }, [input])

  // 把财务数据注入 system prompt（金额全部由确定性代码算好，单位转元，不含逐笔明细）
  const systemPrompt = useMemo(() => {
    const f = (n: number) => formatMoney(n)
    const now = new Date()
    const currentMonth = getCurrentMonth()
    const [y, m] = currentMonth.split('-').map(Number)

    const accountBalances = computeAccountBalances(accounts, transactions)
    const totalBalance = accountBalances.reduce((sum, { balance }) => sum + balance, 0)
    const frozenBalance = accountBalances.filter(ab => ab.account.isFrozen).reduce((sum, ab) => sum + ab.balance, 0)

    const monthTxs = transactions.filter(t => t.date.startsWith(currentMonth))
    const income = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

    const breakdown: Record<string, number> = {}
    monthTxs.filter(t => t.type === 'expense').forEach(t => {
      breakdown[t.categoryId] = (breakdown[t.categoryId] || 0) + t.amount
    })
    const catLines = Object.entries(breakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cid, amt]) => {
        const name = categories.find(c => c.id === cid)?.name || '未分类'
        return `${name} ${f(amt)}（占 ${calculatePercentage(amt, expense)}%）`
      })

    const budget = budgets.find(b => b.month === currentMonth)
    const activeGoals = goals.filter(g => g.status === 'active')
    const goalLines = activeGoals.map(g =>
      `${g.name}（目标 ${f(g.targetAmount)}，已存 ${f(g.currentAmount)}，还差 ${f(g.targetAmount - g.currentAmount)}）`
    )

    const savable = computeMonthlySavable(transactions, recurringIncomes, recurringExpenses)
    const avgDaily = computeAvgDailyExpense(transactions)

    return [
      '你是「财务规划助手」应用右侧常驻的 AI 财务顾问，基于以下由系统算好的用户财务数据（单位：元）回答：',
      `今天是 ${y}年${m}月${now.getDate()}日；账户总余额 ${f(totalBalance)}（可用 ${f(totalBalance - frozenBalance)}${
        frozenBalance > 0 ? `，另有冻结 ${f(frozenBalance)}（如老婆本）不可动用` : ''
      }；各账户：${
        accountBalances.map(ab => `${ab.account.name} ${f(ab.balance)}${ab.account.isFrozen ? `（已冻结${ab.account.frozenNote ? '：' + ab.account.frozenNote : ''}）` : ''}`).join('，') || '无账户'
      }）`,
      `本月（${y}年${m}月）：收入 ${f(income)}、支出 ${f(expense)}、结余 ${f(income - expense)}`,
      budget && budget.totalBudget > 0
        ? `本月预算 ${f(budget.totalBudget)}，已用 ${f(expense)}，${
            budget.totalBudget - expense >= 0
              ? `剩余 ${f(budget.totalBudget - expense)}`
              : `超支 ${f(expense - budget.totalBudget)}`
          }`
        : '本月未设置预算',
      catLines.length ? `本月支出分类：${catLines.join('、')}` : '',
      goalLines.length ? `进行中的攒钱目标：${goalLines.join('；')}` : '暂无进行中的攒钱目标',
      `每月可存约 ${f(savable.savable)}（固定收入 ${f(savable.fixedIncome)} − 固定支出 ${f(savable.fixedExpense)} + 日常月均结余 ${f(savable.variableNet)}）`,
      avgDaily > 0 ? `近30天日均消费 ${f(avgDaily)}` : '',
      '要求：1）所有金额一律以上述数据为准，不要自己改数或重新精算；需要逐笔交易等更明细的数据时直说无法提供；2）口吻像熟朋友聊天：说人话、轻松自然，别用「建议您」「综上所述」「整体来看」这类书面腔，也别动不动分点总结；数据要严谨，说话不用严谨，偶尔开个无伤大雅的小玩笑也行；3）两三句话能说清就不长篇大论，用户追问再展开；4）数据不足时直说，不要编造；5）聚焦记账、预算、攒钱规划，不给具体投资建议；6）用中文；7）用纯文本，不要 Markdown 标记（如星号、井号、减号列表）。',
      // 工具说明：一句话记账 / 周期收支 / 攒钱目标（协议与默认值规则见 aiTools.ts）
      buildToolPromptSection(categories, accounts, getToday()),
    ]
      .filter(Boolean)
      .join('\n')
  }, [transactions, categories, goals, accounts, budgets, recurringIncomes, recurringExpenses])

  const ask = async (question: string, card?: AiHandoffCard) => {
    const q = question.trim()
    if (!q || busy) return
    setError('')
    // 回传历史只带 role/content（工具执行结果以摘要形式附在 content 里），思考过程等展示字段不参与对话；
    // 展示消息额外保留交接卡片
    const strip = (m: PanelMessage): AiChatMessage => ({
      role: m.role,
      content: m.historyExtra ? `${m.content}\n${m.historyExtra}` : m.content,
    })
    const prev: PanelMessage[] = chat.map(m => ({ ...strip(m), card: m.card }))
    const userMsg: PanelMessage = { role: 'user', content: q, card }
    const history: AiChatMessage[] = [...prev.map(strip), { role: 'user', content: q }]
    setChat([...prev, userMsg])
    setInput('')
    setBusy(true)
    const startedAt = Date.now()
    try {
      const r = await sendAiChat(history, systemPrompt, { thinking: deepThinking })
      // 解析 FP_ACTION / FP_CHART 指令：创建由本地校验后落库，图表由本地算数渲染，AI 不直接写数据
      const { action, chart, text } = parseAiDirectives(r.reply)
      let content = text
      let actionCard: PanelMessage['action']
      let historyExtra: string | undefined
      // 图表：优先用 AI 输出的 FP_CHART；模型偶尔不输出，用本地关键词兑底识别意图（无数据不会出图）
      const chartReq = chart ?? detectChartIntent(q)
      const chartData = chartReq ? computeChatChart(chartReq) : null
      if (action) {
        const result = await executeAiTool(action)
        if (result.ok) {
          actionCard = { ...result, undone: false }
          historyExtra = result.historyNote
          if (!content) content = `${result.title}。`
        } else {
          actionCard = result
          if (!content) content = `创建未完成：${result.reason}`
        }
      }
      setChat([
        ...prev,
        userMsg,
        {
          role: 'assistant',
          content,
          reasoning: r.reasoning || undefined,
          elapsedMs: Date.now() - startedAt,
          action: actionCard,
          chart: chartData || undefined,
          priceNote: r.priceNote,
          historyExtra,
        },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 请求失败')
    } finally {
      setBusy(false)
    }
  }

  /** 撤销第 index 条消息创建的数据 */
  const undoAt = async (index: number) => {
    const msg = chat[index]
    if (!msg?.action?.ok || msg.action.undone) return
    try {
      await undoAiTool(msg.action.undo)
      setChat(prev =>
        prev.map((m, i) => (i === index && m.action?.ok ? { ...m, action: { ...m.action, undone: true } } : m))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '撤销失败')
    }
  }

  // 消费外部投喂的消息（如灵魂拷问→细聊）：面板就绪且空闲时自动发送
  useEffect(() => {
    const p = pending
    if (!p || !aiReady || busy) return
    clearPending()
    ask(p.question, p.card)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, aiReady, busy])

  if (!aiReady) return null

  // ============ 收起态：窄条竖排入口 ============
  if (collapsed) {
    return (
      <aside
        className="hidden lg:flex sticky top-0 h-screen w-[60px] flex-shrink-0 self-start flex-col
          items-center gap-3 py-4 bg-cream border-l border-sand-200"
      >
        <button
          onClick={expand}
          title="展开 AI 助手"
          className="w-10 h-10 rounded-lg bg-brown text-white flex items-center justify-center
            shadow-sm hover:bg-brown-500 active:scale-95 transition-all"
        >
          <Sparkles className="w-5 h-5" strokeWidth={1.5} />
        </button>
        <span className="text-xs text-charcoal-300 tracking-widest [writing-mode:vertical-rl] select-none">
          AI 助手
        </span>
      </aside>
    )
  }

  // ============ 展开态：常驻对话面板 ============
  return (
    <aside
      className="hidden lg:flex sticky top-0 h-screen w-[320px] flex-shrink-0 self-start flex-col
        bg-cream border-l border-sand-200"
    >
      {/* 头部 */}
      <div className="h-16 flex items-center justify-between gap-2 px-4 border-b border-sand-200 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-brown text-white flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4" strokeWidth={1.5} />
          </div>
          <h2 className="text-base font-display font-semibold text-charcoal truncate">AI 助手</h2>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {chat.length > 0 && (
            <button
              onClick={() => {
                setChat([])
                setError('')
              }}
              title="清空对话"
              className="p-1.5 rounded-md text-charcoal-300 hover:text-charcoal hover:bg-sand-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
          <button
            onClick={collapse}
            title="收起 AI 助手"
            className="p-1.5 rounded-md text-charcoal-300 hover:text-charcoal hover:bg-sand-100 transition-colors"
          >
            <PanelRightClose className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* 消息区 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
        {chat.length === 0 ? (
          <div className="h-full min-h-[16rem] flex flex-col items-center justify-center gap-3 p-3 text-center">
            <Sparkles className="w-8 h-8 text-brown" strokeWidth={1.5} />
            <p className="text-sm text-charcoal-300 leading-relaxed">
              我了解你的余额、预算和攒钱目标
              <br />
              也能一句话帮你记账、加周期收支、立攒钱目标{searchReady ? '，还能联网查实时价格' : ''}
            </p>
            <div className="flex flex-col gap-2 w-full max-w-[240px] mt-1">
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  disabled={busy}
                  className="text-sm text-left px-3 py-2 rounded-lg bg-white border border-sand-200
                    text-charcoal-300 hover:text-brown hover:border-brown-200 transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {chat.map((msg, i) => (
              <div key={i} className={msg.role === 'user' && !msg.card ? 'text-right' : ''}>
                {msg.role === 'assistant' && msg.reasoning && (
                  <ThinkingBlock reasoning={msg.reasoning} elapsedMs={msg.elapsedMs} />
                )}
                {msg.card ? (
                  <HandoffCardBlock data={msg.card} />
                ) : (
                  <div
                    className={`inline-block max-w-[92%] rounded-lg text-sm text-left
                      whitespace-pre-wrap break-words ${
                        msg.role === 'user'
                          ? 'px-3 py-2 bg-brown text-white'
                          : 'text-charcoal'
                      }`}
                  >
                    {msg.content}
                  </div>
                )}
                {msg.action && <ActionCard result={msg.action} onUndo={() => undoAt(i)} />}
                {msg.chart && <ChartBlock data={msg.chart} />}
                {msg.priceNote && (
                  <div
                    className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-terra-50 border border-terra-100 px-2.5 py-1.5 max-w-[92%]"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-terra flex-shrink-0 mt-px" strokeWidth={1.5} />
                    <p className="text-[11px] text-terra leading-relaxed">
                      价格来自网络搜索，仅供参考。行情随时变动，实际价格请以购物软件为准。
                    </p>
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <p className="text-xs text-charcoal-300 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 animate-pulse" />
                {deepThinking ? 'AI 深度思考中…' : 'AI 思考中…'}
              </p>
            )}
            <div ref={chatBottomRef} />
          </>
        )}
      </div>

      {error && <p className="text-xs text-terra px-3 pb-1.5 flex-shrink-0">{error}</p>}

      {/* 输入区：单容器式对话输入框（自动伸缩，Enter 发送），留白舒展版 */}
      <div className="px-3 py-2.5 border-t border-sand-200 flex-shrink-0">
        <div
          className="rounded-xl bg-white border border-sand-200 transition-all
            focus-within:border-brown-300 focus-within:ring-1 focus-within:ring-brown-200"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              // Enter 发送、Shift+Enter 换行；输入法组合期间的 Enter 不触发
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                ask(input)
              }
            }}
            placeholder={
              deepThinking ? '深度思考模式，问一问或说「记一笔午饭 30」…' : '问一问，或直接说「记一笔午饭 30」…'
            }
            className="block w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm text-charcoal
              placeholder:text-charcoal-300/70 focus:outline-none"
          />
          <div className="flex items-center justify-between px-2 pb-2.5">
            <button
              onClick={() => setDeepThinking(v => !v)}
              title="深度思考：回答前先推理，更全面但更慢（需模型支持）"
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs border transition-colors
                ${
                  deepThinking
                    ? 'bg-brown-50 border-brown-200 text-brown'
                    : 'bg-white border-sand-200 text-charcoal-300 hover:text-charcoal hover:border-sand-300'
                }`}
            >
              <Brain className="w-3.5 h-3.5" strokeWidth={1.5} />
              深度思考
            </button>
            <button
              onClick={() => ask(input)}
              disabled={!input.trim() || busy}
              title="发送（Enter）"
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                transition-all active:scale-90
                ${
                  input.trim() || busy
                    ? 'bg-brown text-white hover:bg-brown-500'
                    : 'bg-sand-100 text-charcoal-300 cursor-not-allowed'
                }`}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" strokeWidth={2.2} />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
