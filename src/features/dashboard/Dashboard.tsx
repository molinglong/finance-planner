import { useMemo, useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { getCurrentMonth, formatMoney, calculatePercentage } from '../../utils/format'
import { readableTextColor, chartColor } from '../../utils/colors'
import { computeMonthlySavable } from '../../utils/purchaseAnalysis'
import { TrendingUp, TrendingDown, Wallet, CreditCard, ChevronRight, X, Hand } from 'lucide-react'
import Icon from '../../components/ui/Icon'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import StatCard from '../../components/dashboard/StatCard'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const transactions = useAppStore(state => state.transactions)
  const categories = useAppStore(state => state.categories)
  const goals = useAppStore(state => state.goals)
  const accounts = useAppStore(state => state.accounts)
  const budgets = useAppStore(state => state.budgets)
  const recurringIncomes = useAppStore(state => state.recurringIncomes)
  const recurringExpenses = useAppStore(state => state.recurringExpenses)
  
  const currentMonth = getCurrentMonth()
  
  // 环形图悬浮扇区索引（null 表示未悬浮，中心文字与图例随之联动）
  const [activePieIndex, setActivePieIndex] = useState<number | null>(null)
  
  // 新手引导关闭状态（与设置页共用同一个 localStorage key）
  const GUIDE_STORAGE_KEY = 'welcome-guide-dismissed'
  const [guideDismissed, setGuideDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(GUIDE_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  
  const dismissGuide = () => {
    setGuideDismissed(true)
    try {
      localStorage.setItem(GUIDE_STORAGE_KEY, 'true')
    } catch {
      /* ignore */
    }
  }
  
  // 总账户余额（动态计算）
  const totalBalance = useMemo(() => {
    let total = 0
    for (const acc of accounts) {
      const accTxs = transactions.filter(t => t.accountId === acc.id)
      const income = accTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
      const expense = accTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
      total += acc.initialBalance + income - expense
    }
    return total
  }, [accounts, transactions])
  
  // 各账户余额
  const accountBalances = useMemo(() => {
    return accounts.map(acc => {
      const accTxs = transactions.filter(t => t.accountId === acc.id)
      const income = accTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
      const expense = accTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
      return {
        account: acc,
        balance: acc.initialBalance + income - expense,
      }
    })
  }, [accounts, transactions])

  // 冻结账户（如“老婆本”）：总余额包含，但不可动用
  const frozenBalance = accountBalances.filter(ab => ab.account.isFrozen).reduce((sum, ab) => sum + ab.balance, 0)
  const availableBalance = totalBalance - frozenBalance
  
  // 本月统计
  const monthlyStats = useMemo(() => {
    const monthTransactions = transactions.filter(t => t.date.startsWith(currentMonth))
    
    const income = monthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0)
    
    const expense = monthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0)
    
    return { income, expense, balance: income - expense }
  }, [transactions, currentMonth])
  
  // 本月预算
  const currentBudget = useMemo(() => {
    return budgets.find(b => b.month === currentMonth)
  }, [budgets, currentMonth])
  
  // 预算使用百分比
  const budgetPercentage = useMemo(() => {
    if (!currentBudget || currentBudget.totalBudget <= 0) return 0
    return Math.round((monthlyStats.expense / currentBudget.totalBudget) * 100)
  }, [currentBudget, monthlyStats.expense])
  
  // 分类统计
  const categoryBreakdown = useMemo(() => {
    const monthExpenses = transactions.filter(t => 
      t.type === 'expense' && t.date.startsWith(currentMonth)
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
  }, [transactions, categories, currentMonth])
  
  // 环形图悬浮中的分类项（悬浮扇区或图例行时，中心切换显示对应分类数值）
  const activePieItem = activePieIndex !== null ? categoryBreakdown[activePieIndex] : undefined
  
  // 图例最多详细展示 5 类，其余合并为「其他」
  const legendItems = categoryBreakdown.slice(0, 5)
  const restItems = categoryBreakdown.slice(5)
  const restTotal = restItems.reduce((sum, item) => sum + item.value, 0)
  
  // 最近交易
  const recentTransactions = useMemo(() => {
    return transactions.slice(0, 5)
  }, [transactions])
  
  // 目标进度（首页只展示前 3 个）
  const activeGoals = useMemo(() => {
    return goals.filter(g => g.status === 'active').slice(0, 3)
  }, [goals])
  const activeGoalCount = useMemo(() => goals.filter(g => g.status === 'active').length, [goals])

  // 每月可存（周期性收支 + 历史结余，用于目标达成预测）
  const now = useMemo(() => new Date(), [])
  const monthlySavable = useMemo(
    () => computeMonthlySavable(transactions, recurringIncomes, recurringExpenses).savable,
    [transactions, recurringIncomes, recurringExpenses]
  )
  
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold text-charcoal">
          仪表盘
        </h1>
        <p className="text-sm text-charcoal-300 mt-1">
          财务状况一览
        </p>
      </div>
      
      {/* 新手引导 */}
      {transactions.length === 0 && !guideDismissed && (
        <Card className="mb-6 p-5 border-l-4 border-brown">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-charcoal flex items-center gap-2">
              <Hand className="w-5 h-5" />
              欢迎使用财务规划助手
            </h3>
            <button
              onClick={dismissGuide}
              title="关闭引导（可在设置中重新开启）"
              className="p-1 -mt-1 -mr-1 rounded text-charcoal-300 hover:text-charcoal hover:bg-sand-200
                transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <ol className="space-y-1.5 text-sm text-charcoal-300 list-decimal list-inside">
            <li>去<Link to="/settings" className="text-brown hover:underline">设置</Link>页面校准你的微信/支付宝余额</li>
            <li>以后每花一笔钱，就在<Link to="/transactions" className="text-brown hover:underline">记账</Link>里记一笔</li>
            <li>想买什么就记在<Link to="/goals" className="text-brown hover:underline">想买的东西</Link>里，慢慢攒钱</li>
            <li>拿不准买不买时，在<Link to="/goals" className="text-brown hover:underline">想买的东西</Link>里点「现在买会怎样」算一算</li>
          </ol>
        </Card>
      )}
      
      {/* Total Balance */}
      <Card className="mb-6 p-6 bg-gradient-to-r from-brown to-brown-400 text-white border-none">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white-80 mb-2">当前总余额</p>
            <p className="text-4xl font-semibold tabular-nums">{formatMoney(totalBalance)}</p>
            {frozenBalance > 0 && (
              <p className="text-xs text-white-60 mt-1.5">
                可用 {formatMoney(availableBalance)} · 冻结 {formatMoney(frozenBalance)}（不能动）
              </p>
            )}
          </div>
          <CreditCard className="w-16 h-16 text-white-60" />
        </div>
      </Card>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="本月收入"
          amount={monthlyStats.income}
          icon={<TrendingUp className="w-5 h-5" />}
          color="olive"
        />
        <StatCard
          title="本月支出"
          amount={monthlyStats.expense}
          icon={<TrendingDown className="w-5 h-5" />}
          color="terra"
        />
        <StatCard
          title="本月结余"
          amount={monthlyStats.balance}
          icon={<Wallet className="w-5 h-5" />}
          color="brown"
          showSign
        />
      </div>
      
      {/* Budget Card */}
      <Card className="mb-6 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-charcoal">本月预算</h3>
          <Link to="/settings">
            <Button variant="ghost" size="sm">
              {currentBudget ? '编辑' : '设置'}<ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
        
        {currentBudget && currentBudget.totalBudget > 0 ? (
          <>
            <div className="flex items-end justify-between mb-2">
              <div>
                <p className="text-xs text-charcoal-300 mb-0.5">预算 {formatMoney(currentBudget.totalBudget)}</p>
                <p className="text-sm text-charcoal tabular-nums">
                  已用 <span className={monthlyStats.expense > currentBudget.totalBudget ? 'text-terra font-semibold' : 'text-charcoal font-semibold'}>{formatMoney(monthlyStats.expense)}</span>
                </p>
              </div>
              <p className={`text-sm font-semibold tabular-nums ${
                currentBudget.totalBudget - monthlyStats.expense >= 0 ? 'text-olive' : 'text-terra'
              }`}>
                {currentBudget.totalBudget - monthlyStats.expense >= 0 ? '剩余' : '超支'} {formatMoney(Math.abs(currentBudget.totalBudget - monthlyStats.expense))}
              </p>
            </div>
            
            {/* Total Progress Bar */}
            <div className="h-3 bg-sand-100 rounded-full overflow-hidden mb-2">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  budgetPercentage > 100 ? 'bg-terra' : budgetPercentage > 80 ? 'bg-brown-300' : 'bg-olive'
                }`}
                style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
              />
            </div>
            <p className="text-xs text-charcoal-300 mb-4">已使用 {budgetPercentage}%</p>
            
            {/* 分类预算 */}
            {currentBudget.categoryBudgets.filter(cb => cb.amount > 0).length > 0 && (
              <div className="space-y-3 pt-4 border-t border-sand-100">
                <p className="text-sm font-medium text-charcoal-400">分类预算</p>
                {currentBudget.categoryBudgets.map(cb => {
                  const cat = categories.find(c => c.id === cb.categoryId)
                  if (!cat || cb.amount <= 0) return null
                  const spend = transactions
                    .filter(t => t.type === 'expense' && t.date.startsWith(currentMonth) && t.categoryId === cb.categoryId)
                    .reduce((sum, t) => sum + t.amount, 0)
                  const catPercentage = Math.round((spend / cb.amount) * 100)
                  return (
                    <div key={cb.categoryId}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-sm text-charcoal">{cat.name}</span>
                          {catPercentage >= 100 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-terra-50 text-terra font-medium">
                              已超支
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-charcoal-300 tabular-nums">
                          {formatMoney(spend)} / {formatMoney(cb.amount)}
                        </span>
                      </div>
                      <div className="h-2 bg-sand-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            catPercentage > 100 ? 'bg-terra' : catPercentage > 80 ? 'bg-brown-300' : 'bg-olive'
                          }`}
                          style={{ width: `${Math.min(catPercentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <div className="py-6 text-center">
            <p className="text-charcoal-300 text-sm mb-3">
              本月尚未设置预算，设置后这里会显示超支预警
            </p>
            <Link to="/settings">
              <Button size="sm">去设置预算</Button>
            </Link>
          </div>
        )}
      </Card>
      
      {/* Accounts Section */}
      <Card className="mb-6 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-charcoal">各账户余额</h3>
          <Link to="/settings">
            <Button variant="ghost" size="sm">
              管理<ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {accountBalances.map(({ account, balance }) => (
            <div 
              key={account.id}
              className="flex items-center gap-3 p-4 bg-white rounded-xl border border-sand-200
                hover:shadow-sm transition-shadow"
            >
              <div 
                className="w-11 h-11 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0"
                style={{ backgroundColor: account.color, color: readableTextColor(account.color) }}
              >
                <Icon name={account.icon} className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-charcoal truncate">{account.name}</p>
                <p className="text-lg font-semibold text-charcoal tabular-nums truncate">
                  {formatMoney(balance)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
      
      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Category Pie Chart */}
        <Card className="p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-lg font-medium text-charcoal">
              本月支出分类
            </h3>
            {categoryBreakdown.length > 0 && (
              <span className="text-sm text-charcoal-300">
                共 {categoryBreakdown.length} 类 · ¥{formatMoney(monthlyStats.expense)}
              </span>
            )}
          </div>
          {categoryBreakdown.length > 0 ? (
            <div className="h-64 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={categoryBreakdown.length > 1 ? 2 : 0}
                    dataKey="value"
                    onMouseEnter={(_, index) => setActivePieIndex(index)}
                    onMouseLeave={() => setActivePieIndex(null)}
                  >
                    {categoryBreakdown.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColor(entry.color)}
                        opacity={activePieIndex === null || activePieIndex === index ? 1 : 0.45}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* 环形图中心：悬浮扇区时显示对应分类，移出后恢复本月总支出 */}
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
                    <p className="text-xs text-charcoal-300 mb-1">本月支出</p>
                    <p className="text-xl font-semibold text-charcoal tabular-nums">
                      ¥{formatMoney(monthlyStats.expense)}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center">
              <p className="text-charcoal-300 text-sm">本月暂无支出记录</p>
            </div>
          )}
          
          {/* 分类图例：少分类用占比进度条行，多分类用两列紧凑网格，悬浮均与环形图中心联动 */}
          {categoryBreakdown.length > 0 && (
            categoryBreakdown.length <= 3 ? (
              <div className="mt-4 space-y-1.5" onMouseLeave={() => setActivePieIndex(null)}>
                {categoryBreakdown.map((item, index) => (
                  <div
                    key={item.name}
                    onMouseEnter={() => setActivePieIndex(index)}
                    className={`rounded-lg px-2.5 py-2 -mx-2.5 transition-colors cursor-default ${
                      activePieIndex === index ? 'bg-cream' : 'hover:bg-cream-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
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
                    <div className="h-1.5 bg-sand-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${item.percentage}%`, backgroundColor: chartColor(item.color) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5" onMouseLeave={() => setActivePieIndex(null)}>
                {legendItems.map((item, index) => (
                  <div
                    key={item.name}
                    onMouseEnter={() => setActivePieIndex(index)}
                    className={`rounded-lg px-2 py-1.5 transition-colors cursor-default ${
                      activePieIndex === index ? 'bg-cream' : 'hover:bg-cream-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: chartColor(item.color) }}
                        />
                        <span className="text-sm text-charcoal truncate">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-medium text-charcoal tabular-nums">
                          ¥{formatMoney(item.value)}
                        </span>
                        <span className="text-xs text-charcoal-300 tabular-nums w-8 text-right">
                          {item.percentage}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1 bg-sand-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${item.percentage}%`, backgroundColor: chartColor(item.color) }}
                      />
                    </div>
                  </div>
                ))}
                {/* 超出 5 类时合并展示 */}
                {restItems.length > 0 && (
                  <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
                    <span className="text-xs text-charcoal-300 truncate">
                      其他 {restItems.length} 类
                    </span>
                    <span className="text-xs text-charcoal-300 tabular-nums shrink-0">
                      ¥{formatMoney(restTotal)} · {calculatePercentage(restTotal, monthlyStats.expense)}%
                    </span>
                  </div>
                )}
              </div>
            )
          )}
        </Card>
        
        {/* Goals Progress */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-charcoal">
              想买的东西
            </h3>
            <Link to="/goals">
              <Button variant="secondary" size="sm">
                管理<ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          {activeGoals.length > 0 ? (
            <>
              <div className="space-y-3">
                {activeGoals.map((goal) => {
                  const percentage = calculatePercentage(goal.currentAmount, goal.targetAmount)
                  const remaining = goal.targetAmount - goal.currentAmount

                  // 信息行：还差多少 + 截止/达成预测（全部本地确定性计算）
                  let infoText = ''
                  let infoClass = 'text-charcoal-300'
                  if (remaining <= 0) {
                    infoText = '已攒满，快去完成它'
                    infoClass = 'text-olive'
                  } else if (goal.deadline) {
                    const [dy, dm] = goal.deadline.split('-').map(Number)
                    const monthsLeft = (dy - now.getFullYear()) * 12 + (dm - (now.getMonth() + 1))
                    if (monthsLeft <= 0) {
                      infoText = `还差 ${formatMoney(remaining)} · 已到截止时间`
                      infoClass = 'text-terra'
                    } else {
                      const deadlineLabel = dy === now.getFullYear() ? `${dm}月` : `${dy}年${dm}月`
                      const requiredMonthly = remaining / monthsLeft
                      if (monthlySavable > 0 && monthlySavable >= requiredMonthly) {
                        infoText = `还差 ${formatMoney(remaining)} · ${deadlineLabel}截止，按当前节奏赶得上`
                        infoClass = 'text-olive'
                      } else {
                        const requiredYuan = Math.ceil(requiredMonthly / 100) * 100
                        infoText = `还差 ${formatMoney(remaining)} · ${deadlineLabel}截止，需每月存 ${formatMoney(requiredYuan)}`
                        infoClass = 'text-terra'
                      }
                    }
                  } else if (monthlySavable > 0) {
                    const monthsNeeded = Math.ceil(remaining / monthlySavable)
                    const eta = new Date(now.getFullYear(), now.getMonth() + monthsNeeded, 1)
                    infoText = `还差 ${formatMoney(remaining)} · 按每月可存 ${formatMoney(monthlySavable)}，预计 ${eta.getFullYear()}年${eta.getMonth() + 1}月达成`
                  } else {
                    infoText = `还差 ${formatMoney(remaining)}`
                  }

                  return (
                    <div key={goal.id} className="bg-sand-50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center shadow-sm shrink-0"
                          style={{ backgroundColor: goal.color, color: readableTextColor(goal.color) }}
                        >
                          <Icon name={goal.icon} className="w-5 h-5" />
                        </div>
                        <span className="text-sm font-medium text-charcoal truncate flex-1">{goal.name}</span>
                        <span className="text-sm font-semibold text-brown tabular-nums">{percentage}%</span>
                      </div>
                      <div className="h-2.5 bg-white rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%`, backgroundColor: chartColor(goal.color) }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-charcoal-300">
                          已存 <span className="text-charcoal font-medium tabular-nums">{formatMoney(goal.currentAmount)}</span>
                        </span>
                        <span className="text-charcoal-300 tabular-nums">目标 {formatMoney(goal.targetAmount)}</span>
                      </div>
                      <p className={`text-xs ${infoClass}`}>{infoText}</p>
                    </div>
                  )
                })}
              </div>
              {activeGoalCount > activeGoals.length && (
                <Link
                  to="/goals"
                  className="block mt-3 text-center text-sm text-brown hover:underline"
                >
                  还有 {activeGoalCount - activeGoals.length} 个，查看全部
                </Link>
              )}
            </>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center gap-3">
              <p className="text-charcoal-300 text-sm">还没有想买的东西</p>
              <Link to="/goals">
                <Button size="sm" variant="secondary">去添加一个</Button>
              </Link>
            </div>
          )}
        </Card>
      </div>
      
      {/* Recent Transactions */}
      <Card className="p-5">
        <h3 className="text-lg font-medium text-charcoal mb-4">
          最近交易
        </h3>
        {recentTransactions.length > 0 ? (
          <div className="space-y-3">
            {recentTransactions.map((t) => {
              const category = categories.find(c => c.id === t.categoryId)
              return (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-sand-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <span 
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                      style={{ backgroundColor: category?.color || '#8A8580', color: readableTextColor(category?.color || '#8A8580') }}
                    >
                      {category?.name.charAt(0) || '?'}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-charcoal">{category?.name || '未分类'}</p>
                      <p className="text-xs text-charcoal-300">{t.date}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-medium tabular-nums ${
                    t.type === 'income' ? 'text-olive' : 'text-terra'
                  }`}>
                    {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount)}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-8 text-center">
            <p className="text-charcoal-300 text-sm">暂无交易记录</p>
          </div>
        )}
      </Card>
    </div>
  )
}
