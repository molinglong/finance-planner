// ============================================
// 财务规划助手 - 类型定义
// ============================================

// 交易类型
export type TransactionType = 'income' | 'expense'

// 交易记录
export interface Transaction {
  id: string
  type: TransactionType
  amount: number // 金额（分）
  categoryId: string
  accountId: string // 关联账户
  date: string // ISO 8601 日期 YYYY-MM-DD
  note?: string
  createdAt: number
  updatedAt: number
}

// 分类
export interface Category {
  id: string
  name: string
  type: TransactionType
  icon: string
  color: string
  isPreset: boolean
  sortOrder: number
}

// 储蓄目标状态（cooling = 冷静期中；rejected = 冷静期后放弃，计入省钱战绩）
export type GoalStatus = 'active' | 'completed' | 'abandoned' | 'cooling' | 'rejected'

// 账户
export interface Account {
  id: string
  name: string
  icon: string
  color: string
  initialBalance: number // 初始余额（手动设定）
  isPreset: boolean
  sortOrder: number
  status: 'active' | 'inactive'
  createdAt: number
  isFrozen?: boolean // 冻结（如“老婆本”）：不计入可用余额，不可划出/支出
  frozenNote?: string // 冻结备注（如“老婆本”）
}



// 周期性收入频率
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

// 周期性收入
export interface RecurringIncome {
  id: string
  name: string // "工资"、"生活费"等
  amount: number // 金额（分）
  frequency: RecurringFrequency
  dayOfMonth?: number // 每月几号（1-31，monthly/yearly 时使用）
  dayOfWeek?: number // 每周几（0-6，0=周日，weekly 时使用）
  accountId: string // 入账账户
  categoryId: string // 收入分类
  startDate: string // 开始日期 YYYY-MM-DD
  endDate?: string // 结束日期（可选）
  isEnabled: boolean // 是否启用
  lastProcessed?: string // 上次处理日期 YYYY-MM-DD
  note?: string // 备注
  createdAt: number
}

// 周期性支出（订阅、房租、水电等）
export interface RecurringExpense {
  id: string
  name: string // "视频会员"、"房租"等
  amount: number // 金额（分）
  frequency: RecurringFrequency
  dayOfMonth?: number // 每月几号（1-31，monthly/yearly 时使用）
  dayOfWeek?: number // 每周几（0-6，0=周日，weekly 时使用）
  accountId: string // 扣款账户
  categoryId: string // 支出分类
  startDate: string // 开始日期 YYYY-MM-DD
  endDate?: string // 结束日期（可选）
  isEnabled: boolean // 是否启用
  lastProcessed?: string // 上次处理日期 YYYY-MM-DD
  note?: string // 备注
  createdAt: number
}

// AI 购买拷问结论（灵魂拷问后保存）
export interface AiVerdict {
  verdict: 'recommend' | 'neutral' | 'avoid' // 推荐购买 / 再想想 / 别买
  dustRate: number // 预估吃灰率 0-100
  summary: string
  createdAt: number
}

/** AI 拷问的一问一答记录（存 goals.aiChat，JSON 序列化） */
export interface InterrogationChat {
  role: 'user' | 'assistant'
  content: string
}

// 储蓄目标（想买的东西；cooling/rejected 为省钱冷静期专用状态）
export interface Goal {
  id: string
  name: string
  targetAmount: number // 目标金额（分）
  currentAmount: number // 当前金额（分）
  deadline?: string // 截止日期
  icon: string
  color: string
  status: GoalStatus
  createdAt: number
  completedAt?: number
  coolingEndsAt?: number // 冷静期截止（epoch 毫秒）
  source?: string // 种草来源（抖音/淘宝/朋友推荐/线下/其他）
  reason?: string // 心动理由
  aiVerdict?: AiVerdict // AI 拷问结论
  aiChat?: InterrogationChat[] | null // AI 拷问问答记录（null = 已清空）
  decidedAt?: number // 转正/放弃时间戳（按月统计省钱战绩）
}



// 预算
export interface Budget {
  id: string
  month: string // 格式：2024-01
  totalBudget: number // 总预算（分）
  categoryBudgets: CategoryBudget[]
}

// 分类预算
export interface CategoryBudget {
  categoryId: string
  amount: number // 预算金额（分）
}

// 统计相关类型
export interface MonthlyStats {
  month: string
  income: number
  expense: number
  balance: number
}

export interface CategoryStats {
  categoryId: string
  categoryName: string
  categoryColor: string
  amount: number
  percentage: number
}

// 仪表盘数据
export interface DashboardData {
  currentMonth: MonthlyStats
  recentTransactions: Transaction[]
  categoryBreakdown: CategoryStats[]
  monthlyTrend: MonthlyStats[]
  goalProgress: GoalProgress[]
}

export interface GoalProgress {
  goal: Goal
  percentage: number
  remainingAmount: number
}
