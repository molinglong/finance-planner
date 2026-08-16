import { useEffect, useMemo, useState } from 'react'
import {
  Heart,
  Sparkles,
  Hourglass,
  TrendingUp,
  TrendingDown,
  Trash2,
  Settings2,
  Coins,
} from 'lucide-react'
import { format } from 'date-fns'
import { Goal } from '../../types'
import { useAppStore } from '../../stores/appStore'
import { api } from '../../api/client'
import { fetchAiConfig } from '../../api/ai'
import { formatMoney } from '../../utils/format'
import { computeSmallExpenseStats, computeSavingRecords } from '../../utils/savingInsights'
import CoolingCard from '../../components/saving/CoolingCard'
import WishForm from '../../components/saving/WishForm'
import InterrogationModal from '../../components/saving/InterrogationModal'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'

const THRESHOLD_KEY = 'small_expense_threshold'
const THRESHOLD_OPTIONS = [1000, 2000, 3000, 5000] // 10/20/30/50 元
const DEFAULT_THRESHOLD = 2000

export default function Saving() {
  const transactions = useAppStore(state => state.transactions)
  const categories = useAppStore(state => state.categories)
  const goals = useAppStore(state => state.goals)
  const deleteGoal = useAppStore(state => state.deleteGoal)

  const [showWish, setShowWish] = useState(false)
  const [interrogation, setInterrogation] = useState<Goal | null>(null)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [editingThreshold, setEditingThreshold] = useState(false)
  const [aiReady, setAiReady] = useState(false)

  // 读取小额阈值（云端 app_settings，未来 APK 共用）
  useEffect(() => {
    api<{ key: string; value: string | null }>(`/app-settings/${THRESHOLD_KEY}`)
      .then(r => {
        const n = Number(r.value)
        if (Number.isFinite(n) && n > 0) setThreshold(Math.round(n))
      })
      .catch(() => {}) // 未设置用默认值
  }, [])

  useEffect(() => {
    fetchAiConfig()
      .then(cfg => setAiReady(cfg.configured))
      .catch(() => setAiReady(false))
  }, [])

  const changeThreshold = (cent: number) => {
    setThreshold(cent)
    api(`/app-settings/${THRESHOLD_KEY}`, { method: 'PUT', body: { value: String(cent) } }).catch(() => {})
  }

  const smallStats = useMemo(
    () => computeSmallExpenseStats(transactions, threshold, categories),
    [transactions, threshold, categories]
  )
  const savingRecords = useMemo(() => computeSavingRecords(goals), [goals])
  const coolingGoals = useMemo(
    () =>
      goals
        .filter(g => g.status === 'cooling')
        .sort((a, b) => (a.coolingEndsAt ?? 0) - (b.coolingEndsAt ?? 0)),
    [goals]
  )

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-semibold text-charcoal">省钱</h1>
          <p className="text-sm text-charcoal-300 mt-1">
            管住小钱、扛住种草：小额警示 · 购物冷静期 · AI 灵魂拷问
          </p>
        </div>
        <Button onClick={() => setShowWish(true)}>
          <Heart className="w-4 h-4 mr-2" />
          记下心动
        </Button>
      </div>

      {/* 上排：小额警示 + 省钱战绩 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* 小额消费警示卡 */}
        <div className="bg-white rounded-lg border border-sand-200 p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-charcoal-400">小额消费警示</h3>
              <p className="text-xs text-charcoal-300 mt-0.5">
                单笔 ≤ ¥{(threshold / 100).toFixed(0)} 算小额，积少成多最伤钱包
              </p>
            </div>
            <button
              onClick={() => setEditingThreshold(v => !v)}
              className={`p-1.5 rounded-md transition-colors ${editingThreshold ? 'bg-sand-100 text-brown' : 'text-charcoal-300 hover:text-charcoal'}`}
              title="调整小额阈值"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>

          {editingThreshold && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-charcoal-300">阈值</span>
              {THRESHOLD_OPTIONS.map(cent => (
                <button
                  key={cent}
                  onClick={() => changeThreshold(cent)}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors
                    ${threshold === cent
                      ? 'border-brown bg-sand-100 text-brown font-medium'
                      : 'border-sand-200 text-charcoal-300 hover:text-charcoal'}`}
                >
                  ¥{cent / 100}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end justify-between">
            <div>
              <p className="text-2xl font-semibold text-charcoal tabular-nums">
                {formatMoney(smallStats.total)}
              </p>
              <p className="text-xs text-charcoal-300 mt-1">
                本月小额 {smallStats.count} 笔 · 占总支出 {smallStats.ratio}%
              </p>
            </div>
            {/* 与上月同期对比 */}
            {smallStats.deltaTotal > 0 ? (
              <p className="text-xs text-terra flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                比上月同期多 {formatMoney(smallStats.deltaTotal)}
              </p>
            ) : smallStats.deltaTotal < 0 ? (
              <p className="text-xs text-olive flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" />
                比上月同期少 {formatMoney(Math.abs(smallStats.deltaTotal))}
              </p>
            ) : (
              <p className="text-xs text-charcoal-300">与上月同期持平</p>
            )}
          </div>

          {smallStats.topCategories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {smallStats.topCategories.map(c => (
                <span
                  key={c.categoryId}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-sand-50 text-charcoal-400"
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.categoryColor }} />
                  {c.categoryName} {formatMoney(c.total)}
                </span>
              ))}
            </div>
          )}
          {smallStats.count === 0 && (
            <p className="text-xs text-charcoal-300 mt-3">本月还没有小额消费，继续保持。</p>
          )}
        </div>

        {/* 省钱战绩卡 */}
        <div className="bg-white rounded-lg border border-sand-200 p-5">
          <h3 className="text-sm font-medium text-charcoal-400 mb-3">省钱战绩</h3>
          <div className="flex items-end gap-6 mb-3">
            <div>
              <p className="text-2xl font-semibold text-olive tabular-nums">
                {formatMoney(savingRecords.monthTotal)}
              </p>
              <p className="text-xs text-charcoal-300 mt-1">
                本月忍住 {savingRecords.monthCount} 次
              </p>
            </div>
            <div>
              <p className="text-lg font-medium text-charcoal-400 tabular-nums">
                {formatMoney(savingRecords.allTimeTotal)}
              </p>
              <p className="text-xs text-charcoal-300 mt-1">累计省下</p>
            </div>
          </div>

          {savingRecords.recent.length > 0 ? (
            <div className="space-y-1.5">
              {savingRecords.recent.map(r => (
                <div key={r.id} className="flex items-center justify-between bg-sand-50 rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon name={r.icon} className="w-3.5 h-3.5 text-brown shrink-0" />
                    <span className="text-sm text-charcoal truncate">{r.name}</span>
                    <span className="text-xs text-charcoal-300 shrink-0">
                      {format(new Date(r.decidedAt), 'M月d日')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-sm text-olive tabular-nums font-medium">
                      +{formatMoney(r.amount)}
                    </span>
                    <button
                      onClick={() => {
                        if (confirm('删除这条省钱记录？（战绩金额会相应减少）')) deleteGoal(r.id)
                      }}
                      className="text-charcoal-300 hover:text-terra transition-colors"
                      title="删除记录"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-charcoal-300 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5" />
              还没有拒绝记录，第一次忍住不买就是省钱的开始
            </p>
          )}
        </div>
      </div>

      {/* 冷静期清单 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-medium text-charcoal flex items-center gap-2">
          <Hourglass className="w-[18px] h-[18px] text-brown" />
          冷静期中的心动
        </h3>
        <span className="text-xs text-charcoal-300">
          {coolingGoals.length > 0 ? `${coolingGoals.length} 件在冷静，别急着掏钱` : ''}
        </span>
      </div>

      {coolingGoals.length === 0 ? (
        <div className="bg-white rounded-lg border border-sand-200 p-10 text-center">
          <Heart className="w-8 h-8 text-sand-200 mx-auto mb-3" />
          <p className="text-sm text-charcoal-300">
            刷到心动的东西先别买，<span className="text-brown">记下来冷静几天</span>，到期后还想要再出手
          </p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setShowWish(true)}>
            <Heart className="w-3.5 h-3.5 mr-1.5" />
            记下第一件心动
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {coolingGoals.map(goal => (
            <CoolingCard key={goal.id} goal={goal} aiReady={aiReady} onInterrogate={setInterrogation} />
          ))}
        </div>
      )}

      {!aiReady && coolingGoals.length > 0 && (
        <p className="text-xs text-charcoal-300 mt-3 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          提示：在「设置」页配置好 AI，就能对心动物品发起灵魂拷问
        </p>
      )}

      {/* 弹窗 */}
      <WishForm isOpen={showWish} onClose={() => setShowWish(false)} />
      {interrogation && (
        <InterrogationModal goal={interrogation} onClose={() => setInterrogation(null)} />
      )}
    </div>
  )
}
