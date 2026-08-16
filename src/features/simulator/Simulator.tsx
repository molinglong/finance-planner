import { useMemo, useState } from 'react'
import {
  CartesianGrid, ComposedChart, Area, Line, ReferenceLine, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Wallet, ArrowDownCircle, ArrowUpCircle, PiggyBank, SlidersHorizontal } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { runSimulation, UNREACHABLE, SimPoint } from '../../utils/simulation'
import StatCard from '../../components/dashboard/StatCard'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import { formatMoney, yuanToCent, centToYuan } from '../../utils/format'

// ---------- 图表辅助 ----------

const BASELINE_COLOR = '#9CA5B8' // 雾霭蓝（蒙灰中调）：按现在的节奏
const SIM_COLOR = '#BA9C9C'      // 陶土玫瑰（蒙灰中调）：模拟方案

/** Y 轴刻度：分 → 元，过万缩写 */
function wanTick(v: number): string {
  const yuan = v / 100
  return yuan >= 10000 ? `${(yuan / 10000).toFixed(1)}万` : `${Math.round(yuan)}`
}

/** 悬浮提示（月份 + 两条曲线金额） */
function SimTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ name?: string | number; value?: number | string; color?: string; payload?: SimPoint }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0].payload
  return (
    <div className="bg-white border border-sand-200 rounded-lg px-3 py-2 shadow-sm">
      <p className="text-xs text-charcoal-300 mb-1">{point?.monthName}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-sm text-charcoal">
          <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-2 font-medium tabular-nums">{formatMoney(Number(p.value))}</span>
        </p>
      ))}
    </div>
  )
}

/** 月份显示：2027年3月 */
function fmtMonth(d?: Date): string {
  return d ? `${d.getFullYear()}年${d.getMonth() + 1}月` : ''
}

/** 元输入字符串 → 分（无效或 ≤0 归零） */
function parseYuanToCent(s: string): number {
  const n = parseFloat(s)
  return Number.isFinite(n) && n > 0 ? yuanToCent(n) : 0
}

// ---------- 页面 ----------

export default function Simulator() {
  // what-if 控件状态（输入用元，计算前转分）
  const [extraMonthlyYuan, setExtraMonthlyYuan] = useState(0)
  const [oneOffExpenseYuan, setOneOffExpenseYuan] = useState('')
  const [oneOffIncomeYuan, setOneOffIncomeYuan] = useState('')
  const [months, setMonths] = useState(12)
  const [selectedGoalId, setSelectedGoalId] = useState('')
  const [expenseGoalId, setExpenseGoalId] = useState('')

  const accounts = useAppStore(state => state.accounts)
  const transactions = useAppStore(state => state.transactions)
  const goals = useAppStore(state => state.goals)
  const recurringIncomes = useAppStore(state => state.recurringIncomes)
  const recurringExpenses = useAppStore(state => state.recurringExpenses)

  const activeGoals = useMemo(() => goals.filter(g => g.status === 'active'), [goals])

  // 模拟引擎（全部确定性计算）
  const result = useMemo(() => runSimulation(
    { accounts, transactions, recurringIncomes, recurringExpenses, goals },
    {
      extraMonthly: yuanToCent(extraMonthlyYuan),
      oneOffExpense: parseYuanToCent(oneOffExpenseYuan),
      oneOffIncome: parseYuanToCent(oneOffIncomeYuan),
      months,
    },
    selectedGoalId || undefined
  ), [accounts, transactions, recurringIncomes, recurringExpenses, goals,
      extraMonthlyYuan, oneOffExpenseYuan, oneOffIncomeYuan, months, selectedGoalId])

  const { points, startAssets, breakdown, goalResult } = result
  const lastPoint = points[points.length - 1]
  const hasWhatIf =
    extraMonthlyYuan > 0 || parseYuanToCent(oneOffExpenseYuan) > 0 || parseYuanToCent(oneOffIncomeYuan) > 0

  /** 选择「从想买的东西带出价格」 */
  const handlePickExpenseGoal = (goalId: string) => {
    setExpenseGoalId(goalId)
    const goal = goals.find(g => g.id === goalId)
    setOneOffExpenseYuan(goal ? String(centToYuan(goal.targetAmount)) : '')
  }

  /** 手动输入金额时解除与想买的东西的关联 */
  const handleExpenseInput = (value: string) => {
    setOneOffExpenseYuan(value)
    if (expenseGoalId) setExpenseGoalId('')
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold text-charcoal">财务模拟</h1>
        <p className="text-sm text-charcoal-300 mt-1">
          按现在的节奏看看未来，试着调整计划会怎样
        </p>
      </div>

      {/* 基准假设（口径与「随手算算」一致） */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="当前总资产" amount={startAssets} icon={<Wallet className="w-4 h-4" strokeWidth={1.5} />} color="brown" />
        <StatCard title="每月固定收入" amount={breakdown.fixedIncome} icon={<ArrowDownCircle className="w-4 h-4" strokeWidth={1.5} />} color="olive" />
        <StatCard title="每月固定支出" amount={breakdown.fixedExpense} icon={<ArrowUpCircle className="w-4 h-4" strokeWidth={1.5} />} color="terra" />
        <StatCard title="每月可存" amount={breakdown.savable} icon={<PiggyBank className="w-4 h-4" strokeWidth={1.5} />} color="olive" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* 左：what-if 控件 */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <SlidersHorizontal className="w-4 h-4 text-brown" strokeWidth={1.5} />
            <h3 className="text-sm font-semibold text-charcoal">调整计划</h3>
          </div>

          <div className="space-y-5">
            {/* 每月额外存入 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-charcoal-400">每月额外存入</label>
                <span className="text-sm font-semibold text-olive tabular-nums">
                  {extraMonthlyYuan.toLocaleString('zh-CN')} 元
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={3000}
                step={100}
                value={extraMonthlyYuan}
                onChange={e => setExtraMonthlyYuan(Number(e.target.value))}
                className="w-full accent-brown"
              />
              <div className="flex justify-between text-xs text-charcoal-300 mt-0.5">
                <span>0</span>
                <span>3000 元</span>
              </div>
            </div>

            {/* 一次性支出 */}
            <div className="space-y-2">
              <Input
                label="一次性支出（元）"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={oneOffExpenseYuan}
                onChange={e => handleExpenseInput(e.target.value)}
              />
              {activeGoals.length > 0 && (
                <Select
                  value={expenseGoalId}
                  onChange={e => handlePickExpenseGoal(e.target.value)}
                  options={[
                    { value: '', label: '从想买的东西带出价格…' },
                    ...activeGoals.map(g => ({
                      value: g.id,
                      label: `${g.name}（${formatMoney(g.targetAmount)} 元）`,
                    })),
                  ]}
                />
              )}
            </div>

            {/* 一次性额外收入 */}
            <Input
              label="一次性额外收入（元）"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={oneOffIncomeYuan}
              onChange={e => setOneOffIncomeYuan(e.target.value)}
            />

            {/* 预测时长 */}
            <Select
              label="预测时长"
              value={String(months)}
              onChange={e => setMonths(Number(e.target.value))}
              options={[
                { value: '6', label: '未来 6 个月' },
                { value: '12', label: '未来 12 个月' },
                { value: '24', label: '未来 24 个月' },
              ]}
            />

            {/* 口径说明 */}
            <p className="text-xs text-charcoal-300 leading-relaxed border-t border-sand-200 pt-3">
              每月可存 = 固定收入 {formatMoney(breakdown.fixedIncome)} − 固定支出 {formatMoney(breakdown.fixedExpense)} + 日常月均结余 {formatMoney(breakdown.variableNet)}
            </p>
          </div>
        </Card>

        {/* 右：图表 + 结论 */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
              <div className="flex-1">
                <Select
                  label="对比目标（可选）"
                  value={selectedGoalId}
                  onChange={e => setSelectedGoalId(e.target.value)}
                  options={[
                    { value: '', label: '不选目标，只看总资产' },
                    ...activeGoals.map(g => ({
                      value: g.id,
                      label: `${g.name}（还差 ${formatMoney(Math.max(0, g.targetAmount - g.currentAmount))} 元）`,
                    })),
                  ]}
                />
              </div>
              {/* 手动图例 */}
              <div className="flex items-center gap-4 pb-2">
                <span className="flex items-center gap-1.5 text-xs text-charcoal-300">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: BASELINE_COLOR }} />
                  按现在的节奏
                </span>
                <span className="flex items-center gap-1.5 text-xs text-charcoal-300">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: SIM_COLOR }} />
                  模拟方案
                </span>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDE7DC" />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fontSize: 11, fill: '#8A8580' }}
                  tickLine={false}
                  axisLine={{ stroke: '#EDE7DC' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={wanTick}
                  tick={{ fontSize: 11, fill: '#8A8580' }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  domain={['auto', 'auto']}
                />
                <Tooltip content={<SimTooltip />} />
                {goalResult && goalResult.remaining > 0 && (
                  <ReferenceLine
                    y={goalResult.targetLevel}
                    stroke={SIM_COLOR}
                    strokeDasharray="6 4"
                    label={{
                      value: `达成「${goalResult.name}」`,
                      position: 'insideTopRight',
                      fontSize: 11,
                      fill: SIM_COLOR,
                    }}
                  />
                )}
                {/* 达成月标记：曲线到达参考线的月份（能买的日子），与两线交点无关 */}
                {goalResult && goalResult.remaining > 0 && (
                  <>
                    {goalResult.baselineMonths > 0
                      && goalResult.baselineMonths !== UNREACHABLE
                      && goalResult.baselineMonths !== goalResult.simulatedMonths
                      && goalResult.baselineMonths <= months && (
                      <ReferenceDot
                        x={points[goalResult.baselineMonths]?.shortLabel}
                        y={goalResult.targetLevel}
                        r={5}
                        fill={BASELINE_COLOR}
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    )}
                    {goalResult.simulatedMonths > 0
                      && goalResult.simulatedMonths !== UNREACHABLE
                      && goalResult.simulatedMonths <= months && (
                      <ReferenceDot
                        x={points[goalResult.simulatedMonths]?.shortLabel}
                        y={goalResult.targetLevel}
                        r={6}
                        fill={SIM_COLOR}
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    )}
                  </>
                )}
                <Area
                  type="monotone"
                  dataKey="baselineAssets"
                  name="按现在的节奏"
                  stroke={BASELINE_COLOR}
                  fill={BASELINE_COLOR}
                  fillOpacity={0.12}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="simulatedAssets"
                  name="模拟方案"
                  stroke={SIM_COLOR}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* 结论横幅 */}
          <Card className="p-4">
            {goalResult ? (
              goalResult.remaining <= 0 ? (
                <p className="text-sm text-charcoal">
                  <span className="font-medium">「{goalResult.name}」已经攒够了</span>，随时可以实现。
                </p>
              ) : goalResult.baselineMonths === UNREACHABLE && goalResult.simulatedMonths === UNREACHABLE ? (
                <p className="text-sm text-charcoal">
                  当前每月可存为 0，暂时无法预测「{goalResult.name}」的达成时间。
                  <span className="text-charcoal-300">先在固定收支里补全收入，或用左侧滑块设定每月额外存入。</span>
                </p>
              ) : (
                <div className="text-sm text-charcoal space-y-1">
                  {goalResult.baselineMonths === UNREACHABLE ? (
                    <p>按现在的节奏<span className="font-medium">无法攒到</span>「{goalResult.name}」。</p>
                  ) : (
                    <p>
                      按现在的节奏约 <span className="font-medium">{fmtMonth(goalResult.baselineDate)}</span> 达成「{goalResult.name}」
                      （还差 {formatMoney(goalResult.remaining)} 元）。
                    </p>
                  )}
                  {goalResult.simulatedMonths === 0 ? (
                    <p className="text-olive font-medium">模拟方案下立刻达成。</p>
                  ) : goalResult.simulatedMonths === UNREACHABLE ? (
                    <p className="text-terra">模拟方案下仍无法达成。</p>
                  ) : goalResult.baselineMonths === UNREACHABLE ? (
                    <p className="text-olive font-medium">
                      模拟方案下约 {fmtMonth(goalResult.simulatedDate)} 达成。
                    </p>
                  ) : goalResult.deltaMonths > 0 ? (
                    <p className="text-olive font-medium">
                      模拟方案提前 {goalResult.deltaMonths} 个月，约 {fmtMonth(goalResult.simulatedDate)} 达成。
                    </p>
                  ) : goalResult.deltaMonths < 0 ? (
                    <p className="text-terra font-medium">
                      模拟方案推迟 {Math.abs(goalResult.deltaMonths)} 个月，约 {fmtMonth(goalResult.simulatedDate)} 达成。
                    </p>
                  ) : (
                    <p className="text-charcoal-300">模拟方案达成时间不变。</p>
                  )}
                </div>
              )
            ) : (
              <p className="text-sm text-charcoal">
                {months} 个月后（{lastPoint?.monthName ?? ''}）总资产：
                基准 <span className="font-medium tabular-nums">{formatMoney(lastPoint?.baselineAssets ?? 0)}</span> 元
                {hasWhatIf && (
                  <>
                    {' '}→ 模拟 <span className="font-medium tabular-nums text-olive">{formatMoney(lastPoint?.simulatedAssets ?? 0)}</span> 元
                    （相差 <span className="tabular-nums">
                      {formatMoney(Math.abs((lastPoint?.simulatedAssets ?? 0) - (lastPoint?.baselineAssets ?? 0)))}
                    </span> 元）
                  </>
                )}
                {!hasWhatIf && <span className="text-charcoal-300">。调整左侧计划试试看。</span>}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
