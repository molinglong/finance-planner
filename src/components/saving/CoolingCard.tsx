import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Trash2, Sparkles, PartyPopper, Lock } from 'lucide-react'
import { Goal } from '../../types'
import { useAppStore } from '../../stores/appStore'
import { formatRemaining, coolingProgress } from '../../utils/savingInsights'
import { readableTextColor } from '../../utils/colors'
import Icon from '../ui/Icon'

interface CoolingCardProps {
  goal: Goal
  /** AI 是否已配置（未配置时拷问按钮禁用） */
  aiReady: boolean
  onInterrogate: (goal: Goal) => void
}

const VERDICT_META: Record<string, { label: string; className: string }> = {
  recommend: { label: '推荐购买', className: 'bg-olive-50 text-olive' },
  neutral: { label: '再想想', className: 'bg-sand-100 text-brown' },
  avoid: { label: '别买', className: 'bg-terra-50 text-terra' },
}

/** 冷静期卡片：结构与 GoalList 攒钱卡同构（大数字 / 共N天 · 进度条 · 百分比/到期日 · 双按钮） */
export default function CoolingCard({ goal, aiReady, onInterrogate }: CoolingCardProps) {
  const promoteGoal = useAppStore(state => state.promoteGoal)
  const rejectGoal = useAppStore(state => state.rejectGoal)
  const deleteGoal = useAppStore(state => state.deleteGoal)

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const endsAt = goal.coolingEndsAt ?? 0
  const expired = now >= endsAt
  const progress = coolingProgress(goal.createdAt, endsAt, now)
  const verdict = goal.aiVerdict
  const totalDays = Math.max(1, Math.round((endsAt - goal.createdAt) / 86400000))

  const handlePromote = () => {
    if (confirm(`确定还想要「${goal.name}」吗？将转入「想买的东西」开始攒钱。`)) {
      promoteGoal(goal.id)
    }
  }

  const handleReject = () => {
    if (confirm(`确定不买「${goal.name}」了？将记入省钱战绩 +¥${(goal.targetAmount / 100).toFixed(2)}。`)) {
      rejectGoal(goal.id)
    }
  }

  const handleDelete = () => {
    if (confirm('确定删除这条心动记录吗？（不计入省钱战绩）')) {
      deleteGoal(goal.id)
    }
  }

  return (
    <div
      className={`bg-white rounded-lg border p-5 flex flex-col transition-colors
        ${expired ? 'border-brown-300' : 'border-sand-200 hover:border-sand-300'}`}
    >
      {/* 商品信息 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: goal.color, color: readableTextColor(goal.color) }}
          >
            <Icon name={goal.icon} className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-charcoal truncate">{goal.name}</h3>
            <p className="text-xs mt-0.5">
              <span className="text-brown font-medium tabular-nums">
                ¥{(goal.targetAmount / 100).toFixed(2)}
              </span>
              <span className="text-charcoal-300"> · {goal.source || '心血来潮'}</span>
            </p>
          </div>
        </div>
        <button
          onClick={handleDelete}
          className="p-1 text-charcoal-300 hover:text-terra transition-colors shrink-0"
          title="删除记录"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* AI 结论徽章 */}
      {verdict && (
        <div
          className={`inline-flex self-start items-center gap-1.5 px-2 py-1 rounded text-xs font-medium mb-3 ${VERDICT_META[verdict.verdict].className}`}
        >
          <Sparkles className="w-3 h-3 shrink-0" />
          AI：{VERDICT_META[verdict.verdict].label} · 吃灰率 {verdict.dustRate}%
        </div>
      )}

      {/* 心动理由 */}
      {goal.reason && (
        <p className="text-xs text-charcoal-300 mb-3 line-clamp-2">心动理由：{goal.reason}</p>
      )}

      {/* 冷静进度（同构攒钱卡：剩余时间 / 共N天 · 进度条 · 百分比 / 到期日） */}
      <div className="mb-4">
        <div className="flex items-end justify-between mb-2">
          {expired ? (
            <span className="text-lg font-semibold text-brown">该做决定了</span>
          ) : (
            <span className="text-lg font-semibold text-charcoal tabular-nums">
              剩 {formatRemaining(endsAt, now)}
            </span>
          )}
          <span className="text-xs text-charcoal-300 tabular-nums">/ 共 {totalDays} 天</span>
        </div>

        <div className="h-2 bg-sand-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${expired ? 'bg-olive' : 'bg-brown'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className={`text-sm font-medium tabular-nums ${expired ? 'text-olive' : 'text-brown'}`}>
            {expired ? (
              <span className="inline-flex items-center gap-1">
                <PartyPopper className="w-3.5 h-3.5" />
                冷静期已结束
              </span>
            ) : (
              `${progress}%`
            )}
          </span>
          <span className="text-xs text-charcoal-300">{format(endsAt, 'M月d日')} 到期</span>
        </div>
      </div>

      {/* 操作区：同构攒钱卡的按钮对 */}
      {expired ? (
        <div className="flex gap-2 mt-auto">
          <button
            className="flex-1 inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-lg
              bg-brown text-white hover:bg-brown-500 transition-colors duration-150"
            onClick={handlePromote}
          >
            还想要，转正
          </button>
          <button
            className="flex-1 inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-lg
              bg-terra text-white hover:bg-terra-500 transition-colors duration-150"
            onClick={handleReject}
          >
            不买了
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2 mt-auto">
            <button
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
                bg-brown text-white hover:bg-brown-500 transition-colors duration-150
                disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!aiReady}
              title={aiReady ? '让 AI 帮你判断值不值得买' : '尚未配置 AI，去设置页配置后可用'}
              onClick={() => onInterrogate(goal)}
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI 拷问
            </button>
            <button
              className="flex-1 inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-lg
                bg-terra text-white hover:bg-terra-500 transition-colors duration-150"
              onClick={handleReject}
            >
              不买了
            </button>
          </div>
          <p className="text-xs text-charcoal-300 mt-2.5 flex items-center justify-center gap-1">
            <Lock className="w-3 h-3" />
            冷静期结束后才能「还想要」转正
          </p>
        </>
      )}
    </div>
  )
}
