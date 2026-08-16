// ============================================
// 财务模拟引擎（纯函数，无副作用）
// 预测口径：总资产 = Σ账户余额 + Σ目标已攒金额
// 目标攒钱只调整账户 initialBalance、不产生交易记录，
// 因此 computeMonthlySavable 的历史结余不会与目标已攒双重计算。
// 目标达成口径与购买分析一致：还需金额 ÷ 每月可攒。
// ============================================
import { Account, Transaction, Goal, RecurringIncome, RecurringExpense } from '../types'
import { addMonths } from 'date-fns'
import {
  computeAccountBalances,
  computeMonthlySavable,
  MonthlySavableBreakdown,
  monthlyRate,
  isEffective,
} from './purchaseAnalysis'

/** what-if 参数（金额单位：分） */
export interface WhatIf {
  extraMonthly: number   // 每月额外存入（≥0）
  oneOffExpense: number  // 一次性支出（第 0 月立即发生）
  oneOffIncome: number   // 一次性额外收入（第 0 月立即到账）
  months: number         // 预测月数
}

/** 预测曲线上的一个月点 */
export interface SimPoint {
  monthIndex: number       // 0 = 当前
  monthName: string        // 2026年9月（悬浮提示用）
  shortLabel: string       // 26/9（横轴用）
  baselineAssets: number   // 基准总资产（分）
  simulatedAssets: number  // 模拟总资产（分）
}

/** 选中目标的达成测算 */
export interface GoalSimResult {
  goalId: string
  name: string
  remaining: number        // 还需攒（分）
  targetLevel: number      // 达成所需总资产水平 = 起点总资产 + remaining（分），图表参考线
  baselineMonths: number   // 基准达成月数（0 = 已达成；-1 = 无法达成）
  simulatedMonths: number  // 模拟达成月数（同上）
  deltaMonths: number      // 正数 = 提前，负数 = 推迟（任一不可达时为 0）
  baselineDate?: Date
  simulatedDate?: Date
}

export interface SimulationResult {
  points: SimPoint[]
  startAssets: number                 // 当前总资产（分）
  breakdown: MonthlySavableBreakdown  // 每月可存拆解（与购买分析口径一致）
  monthlyNet: number[]                // 逐月净流入（分，索引 1..months；0 占位）
  goalResult?: GoalSimResult
}

/** 不可达标记 */
export const UNREACHABLE = -1

export function runSimulation(
  data: {
    accounts: Account[]
    transactions: Transaction[]
    recurringIncomes: RecurringIncome[]
    recurringExpenses: RecurringExpense[]
    goals: Goal[]
  },
  whatIf: WhatIf,
  selectedGoalId?: string
): SimulationResult {
  const { accounts, transactions, recurringIncomes, recurringExpenses, goals } = data
  const months = Math.max(1, Math.min(60, Math.round(whatIf.months)))

  // 1. 起点总资产 = 账户余额合计 + 目标已攒合计
  const accountTotal = computeAccountBalances(accounts, transactions)
    .reduce((sum, { balance }) => sum + balance, 0)
  const goalSavedTotal = goals.reduce((sum, g) => sum + g.currentAmount, 0)
  const startAssets = accountTotal + goalSavedTotal

  // 2. 每月可存拆解（“现在”口径，与购买分析弹窗一致）
  const breakdown = computeMonthlySavable(transactions, recurringIncomes, recurringExpenses)

  // 3. 逐月净流入：周期项可能在预测窗口内生效/到期，逐月判断
  const now = new Date()
  const monthlyNet: number[] = [0]
  for (let m = 1; m <= months; m++) {
    const at = addMonths(now, m)
    const fixedIncome = recurringIncomes
      .filter(it => isEffective(it, at))
      .reduce((s, it) => s + it.amount * monthlyRate(it.frequency), 0)
    const fixedExpense = recurringExpenses
      .filter(it => isEffective(it, at))
      .reduce((s, it) => s + it.amount * monthlyRate(it.frequency), 0)
    monthlyNet[m] = fixedIncome - fixedExpense + breakdown.variableNet
  }

  // 4. 两条曲线：一次性收支发生在第 0 月，额外月存从第 1 月起计入
  const points: SimPoint[] = []
  const push = (m: number, baseline: number, simulated: number) => {
    const d = addMonths(now, m)
    points.push({
      monthIndex: m,
      monthName: `${d.getFullYear()}年${d.getMonth() + 1}月`,
      shortLabel: `${String(d.getFullYear()).slice(2)}/${d.getMonth() + 1}`,
      baselineAssets: Math.round(baseline),
      simulatedAssets: Math.round(simulated),
    })
  }
  push(0, startAssets, startAssets + whatIf.oneOffIncome - whatIf.oneOffExpense)
  for (let m = 1; m <= months; m++) {
    const prev = points[m - 1]
    push(
      m,
      prev.baselineAssets + monthlyNet[m],
      prev.simulatedAssets + monthlyNet[m] + Math.max(0, whatIf.extraMonthly)
    )
  }

  // 5. 目标达成测算：一次性收入直接抵补缺口，一次性支出占用攒钱额度
  const goal = goals.find(g => g.id === selectedGoalId && g.status === 'active')
  let goalResult: GoalSimResult | undefined
  if (goal) {
    const remaining = goal.targetAmount - goal.currentAmount
    const baseRate = breakdown.savable
    const simRate = baseRate + Math.max(0, whatIf.extraMonthly)
    const simRemaining = Math.max(0, remaining + whatIf.oneOffExpense - whatIf.oneOffIncome)

    const baselineMonths = remaining <= 0 ? 0
      : baseRate > 0 ? Math.ceil(remaining / baseRate) : UNREACHABLE
    const simulatedMonths = simRemaining <= 0 ? 0
      : simRate > 0 ? Math.ceil(simRemaining / simRate) : UNREACHABLE

    goalResult = {
      goalId: goal.id,
      name: goal.name,
      remaining,
      targetLevel: startAssets + remaining,
      baselineMonths,
      simulatedMonths,
      deltaMonths:
        baselineMonths === UNREACHABLE || simulatedMonths === UNREACHABLE ? 0
          : baselineMonths - simulatedMonths,
      baselineDate: baselineMonths > 0 ? addMonths(now, baselineMonths) : undefined,
      simulatedDate: simulatedMonths > 0 ? addMonths(now, simulatedMonths) : undefined,
    }
  }

  return { points, startAssets, breakdown, monthlyNet, goalResult }
}
