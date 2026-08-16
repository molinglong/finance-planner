import { useMemo, useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { getRecentMonths, getCurrentMonth, formatMoney, getMonthDisplayName, calculatePercentage } from '../../utils/format'
import { chartColor } from '../../utils/colors'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import Card from '../../components/ui/Card'
import Select from '../../components/ui/Select'
import ExpenseHeatmap from './ExpenseHeatmap'

// 趋势图悬浮提示：月份 + 收入/支出/结余
interface TrendTooltipProps {
  active?: boolean
  payload?: Array<{
    payload: { month: string; income: number; expense: number; balance: number }
  }>
}

function TrendTooltip({ active, payload }: TrendTooltipProps) {
  if (!active || !payload?.length) return null
  const data = payload[0].payload
  return (
    <div className="bg-cream border border-sand-200 rounded-lg px-3 py-2 min-w-[150px]">
      <p className="text-xs text-charcoal-300 mb-1.5">{getMonthDisplayName(data.month)}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#9CAD9C' }} />
          <span className="text-xs text-charcoal-300">收入</span>
          <span className="text-xs font-medium text-charcoal tabular-nums ml-auto">
            ¥{data.income.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#BA9C9C' }} />
          <span className="text-xs text-charcoal-300">支出</span>
          <span className="text-xs font-medium text-charcoal tabular-nums ml-auto">
            ¥{data.expense.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-sand-200">
          <span className="text-xs text-charcoal-300">结余</span>
          <span className={`text-xs font-semibold tabular-nums ml-auto ${
            data.balance >= 0 ? 'text-olive' : 'text-terra'
          }`}>
            {data.balance >= 0
              ? `+¥${data.balance.toFixed(2)}`
              : `-¥${Math.abs(data.balance).toFixed(2)}`}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function Reports() {
  const transactions = useAppStore(state => state.transactions)
  const categories = useAppStore(state => state.categories)
  
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [activePieIndex, setActivePieIndex] = useState<number | null>(null)
  
  const months = getRecentMonths(12)
  
  // 月度统计
  const monthlyStats = useMemo(() => {
    return months.map(month => {
      const monthTransactions = transactions.filter(t => t.date.startsWith(month))
      
      const income = monthTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0)
      
      const expense = monthTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0)
      
      return {
        month,
        label: month.slice(5), // MM-DD -> MM
        income: income / 100,
        expense: expense / 100,
        balance: (income - expense) / 100,
      }
    })
  }, [transactions, months])
  
  // 选中月份分类统计
  const categoryBreakdown = useMemo(() => {
    const monthExpenses = transactions.filter(t => 
      t.type === 'expense' && t.date.startsWith(selectedMonth)
    )
    
    const breakdown: Record<string, number> = {}
    monthExpenses.forEach(t => {
      breakdown[t.categoryId] = (breakdown[t.categoryId] || 0) + t.amount
    })
    
    const total = Object.values(breakdown).reduce((sum, val) => sum + val, 0)
    
    return Object.entries(breakdown)
      .map(([categoryId, amount]) => {
        const category = categories.find(c => c.id === categoryId)
        return {
          name: category?.name || '未分类',
          value: amount,
          color: category?.color || '#8A8580',
          percentage: total > 0 ? calculatePercentage(amount, total) : 0,
        }
      })
      .sort((a, b) => b.value - a.value)
  }, [transactions, categories, selectedMonth])
  
  // 选中月份汇总
  const selectedMonthStats = useMemo(() => {
    const monthTransactions = transactions.filter(t => t.date.startsWith(selectedMonth))
    
    const income = monthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0)
    
    const expense = monthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0)
    
    return { income, expense, balance: income - expense }
  }, [transactions, selectedMonth])
  
  // 环形图悬浮中的分类项（悬浮扇区时中心切换显示对应数值）
  const activePieItem = activePieIndex !== null ? categoryBreakdown[activePieIndex] : undefined
  
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-semibold text-charcoal">
            统计报表
          </h1>
          <p className="text-sm text-charcoal-300 mt-1">
            分析收支趋势与分类
          </p>
        </div>
        
        <Select
          value={selectedMonth}
          onChange={(e) => {
            setSelectedMonth(e.target.value)
            setActivePieIndex(null)
          }}
          options={months.map(m => ({ value: m, label: getMonthDisplayName(m) })).reverse()}
          className="w-40"
        />
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-sm text-charcoal-300 mb-1">收入</p>
          <p className="text-2xl font-semibold text-olive tabular-nums">
            +{formatMoney(selectedMonthStats.income)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-charcoal-300 mb-1">支出</p>
          <p className="text-2xl font-semibold text-terra tabular-nums">
            -{formatMoney(selectedMonthStats.expense)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-charcoal-300 mb-1">结余</p>
          <p className={`text-2xl font-semibold tabular-nums ${
            selectedMonthStats.balance >= 0 ? 'text-olive' : 'text-terra'
          }`}>
            {selectedMonthStats.balance >= 0 ? '+' : ''}{formatMoney(selectedMonthStats.balance)}
          </p>
        </Card>
      </div>
      
      {/* Trend Chart */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-charcoal">
            收支趋势（近12个月）
          </h3>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#9CAD9C' }} />
              <span className="text-sm text-charcoal-300">收入</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#BA9C9C' }} />
              <span className="text-sm text-charcoal-300">支出</span>
            </span>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E3DBE0" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#8A8580"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: '#D3C5B0' }}
                tickFormatter={(value: string) => `${parseInt(value)}月`}
              />
              <YAxis
                stroke="#8A8580"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(value: number) => `¥${value}`}
              />
              <Tooltip cursor={{ fill: '#F7EFE2' }} content={<TrendTooltip />} />
              <Bar dataKey="income" fill="#9CAD9C" radius={[4, 4, 0, 0]} name="收入" maxBarSize={24} />
              <Bar dataKey="expense" fill="#BA9C9C" radius={[4, 4, 0, 0]} name="支出" maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      
      {/* Expense Heatmap */}
      <ExpenseHeatmap transactions={transactions} />
      
      {/* Category Breakdown */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-lg font-medium text-charcoal">
            {getMonthDisplayName(selectedMonth)}支出分类
          </h3>
          {categoryBreakdown.length > 0 && (
            <span className="text-sm text-charcoal-300">
              共 {categoryBreakdown.length} 类 · ¥{formatMoney(selectedMonthStats.expense)}
            </span>
          )}
        </div>
        {categoryBreakdown.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            {/* Pie Chart */}
            <div className="h-64 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={90}
                    paddingAngle={categoryBreakdown.length > 1 ? 2 : 0}
                    dataKey="value"
                    onMouseEnter={(_, index) => setActivePieIndex(index)}
                    onMouseLeave={() => setActivePieIndex(null)}
                  >
                    {categoryBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={chartColor(entry.color)} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* 环形图中心：悬浮扇区时显示对应分类，移出后恢复总支出 */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                {activePieItem ? (
                  <>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: chartColor(activePieItem.color) }}
                      />
                      <p className="text-xs text-charcoal-300">
                        {activePieItem.name} · {activePieItem.percentage}%
                      </p>
                    </div>
                    <p className="text-xl font-semibold text-charcoal tabular-nums">
                      ¥{formatMoney(activePieItem.value)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-charcoal-300 mb-1">支出</p>
                    <p className="text-xl font-semibold text-charcoal tabular-nums">
                      ¥{formatMoney(selectedMonthStats.expense)}
                    </p>
                  </>
                )}
              </div>
            </div>
            
            {/* 分类明细：少分类用大卡片，多分类用列表 */}
            {categoryBreakdown.length <= 2 ? (
              <div className="flex flex-col gap-3">
                {categoryBreakdown.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center gap-4 rounded-lg border border-sand-100 bg-cream-50 p-4"
                  >
                    <span
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${chartColor(item.color)}1F` }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: chartColor(item.color) }}
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-charcoal-300">
                        {item.name} · 占比 {item.percentage}%
                      </p>
                      <p className="text-lg font-semibold text-charcoal tabular-nums">
                        ¥{formatMoney(item.value)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-sand-100">
                {categoryBreakdown.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: chartColor(item.color) }}
                      />
                      <span className="text-sm text-charcoal truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-medium text-charcoal tabular-nums">
                        ¥{formatMoney(item.value)}
                      </span>
                      <span className="text-sm text-charcoal-300 tabular-nums w-11 text-right">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center">
            <p className="text-charcoal-300 text-sm">本月暂无支出记录</p>
          </div>
        )}
      </Card>
    </div>
  )
}
