import { useEffect, useMemo, useRef, useState } from 'react'
import { Goal } from '../../types'
import { useAppStore } from '../../stores/appStore'
import { goalRepo } from '../../db/goals'
import { formatMoney, yuanToCent } from '../../utils/format'
import { fetchAiConfig, sendAiChat, type AiChatMessage } from '../../api/ai'
import {
  buildPurchaseAnalysis,
  computeAccountBalances,
  computeAvgDailyExpense,
  computeMonthlySavable,
} from '../../utils/purchaseAnalysis'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Icon from '../ui/Icon'
import { format } from 'date-fns'
import { CheckCircle2, AlertTriangle, TrendingDown, Lightbulb, Sparkles, Send, Snowflake, Hourglass } from 'lucide-react'
import { toast } from '../ui/Toast'
import { COOLING_PRESETS, recommendCoolingDays } from '../../utils/savingInsights'

interface PurchaseAnalysisModalProps {
  /** 目标模式：分析这个想买的东西 */
  goal?: Goal
  onClose: () => void
}

export default function PurchaseAnalysisModal({ goal, onClose }: PurchaseAnalysisModalProps) {
  const transactions = useAppStore(state => state.transactions)
  const accounts = useAppStore(state => state.accounts)
  const goals = useAppStore(state => state.goals)
  const recurringIncomes = useAppStore(state => state.recurringIncomes)
  const recurringExpenses = useAppStore(state => state.recurringExpenses)
  const purchaseGoal = useAppStore(state => state.purchaseGoal)
  const addGoal = useAppStore(state => state.addGoal)

  // 临时模式（随手算算）的输入
  const [tempName, setTempName] = useState('')
  const [tempPrice, setTempPrice] = useState('')
  const [submitted, setSubmitted] = useState<{ name: string; price: number } | null>(null)

  const accountBalances = useMemo(
    () => computeAccountBalances(accounts, transactions),
    [accounts, transactions]
  )
  const totalBalance = accountBalances.reduce((sum, { balance }) => sum + balance, 0)
  // 冻结账户（如“老婆本”）不计入可用余额：买不买得起只看可用的钱
  const frozenBalance = accountBalances.filter(ab => ab.account.isFrozen).reduce((sum, ab) => sum + ab.balance, 0)
  const availableBalance = totalBalance - frozenBalance
  const avgDailyExpense = useMemo(() => computeAvgDailyExpense(transactions), [transactions])
  const savable = useMemo(
    () => computeMonthlySavable(transactions, recurringIncomes, recurringExpenses),
    [transactions, recurringIncomes, recurringExpenses]
  )
  const monthlySavable = savable.savable

  // 目标模式直接分析；临时模式提交后分析
  const activeItem = goal
    ? { name: goal.name, price: goal.targetAmount }
    : submitted

  const analysis = useMemo(() => {
    if (!activeItem) return null
    return buildPurchaseAnalysis({
      itemName: activeItem.name,
      price: activeItem.price,
      goal,
      totalBalance: availableBalance,
      avgDailyExpense,
      monthlySavable,
      goals,
    })
  }, [activeItem, goal, availableBalance, avgDailyExpense, monthlySavable, goals])

  const handleBuyNow = async () => {
    if (!goal || !analysis) return
    if (!confirm(`确定现在购买「${goal.name}」吗？将从账户划出 ${formatMoney(analysis.gap)} 补齐差额，并完成该目标。`)) return
    await purchaseGoal(goal.id)
    onClose()
  }

  const handleSaveAsGoal = async () => {
    if (!submitted) return
    await addGoal({
      name: submitted.name,
      targetAmount: submitted.price,
      currentAmount: 0,
      deadline: undefined,
      icon: 'target',
      color: '#EFC8C8',
      status: 'active',
    })
    onClose()
  }

  // 先冷静一下：不直接买，也不进愿望清单，而是进入省钱页的冷静期
  const handleCoolDown = async () => {
    if (!submitted) return
    const days = recommendCoolingDays(submitted.price)
    const label = COOLING_PRESETS.find(p => p.days === days)?.label ?? `${days} 天`
    await goalRepo.create({
      name: submitted.name,
      targetAmount: submitted.price,
      currentAmount: 0,
      deadline: undefined,
      icon: 'target',
      color: '#EFC8C8',
      status: 'cooling',
      coolingEndsAt: Date.now() + days * 86400000,
      source: '随手算算',
    })
    await useAppStore.getState().refreshGoals()
    toast(`已进入 ${label} 冷静期，去「省钱」页看倒计时`, 'success')
    onClose()
  }

  // ============ AI 建议（已配置时显示） ============
  const [aiReady, setAiReady] = useState(false)
  const [aiChat, setAiChat] = useState<AiChatMessage[]>([])
  const [aiInput, setAiInput] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const chatBottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchAiConfig()
      .then(cfg => setAiReady(cfg.configured))
      .catch(() => setAiReady(false))
  }, [])

  // 滚动到最新消息
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [aiChat, aiBusy])

  // 把算好的分析数据注入 system prompt（单位转元，不含原始交易明细）
  const systemPrompt = useMemo(() => {
    if (!analysis) return ''
    const f = (n: number) => formatMoney(n)
    const acctLine = accountBalances.map(ab => `${ab.account.name} ${f(ab.balance)}${ab.account.isFrozen ? `（已冻结${ab.account.frozenNote ? '：' + ab.account.frozenNote : ''}，不可动用）` : ''}`).join('，')
    const impactLine = analysis.goalImpacts.length
      ? analysis.goalImpacts
          .map(i => `${i.goalName}（还需 ${f(i.remaining)}${i.delayedMonths > 0 ? `，现在买会推迟 ${i.delayedMonths} 个月` : '，不受影响'}）`)
          .join('；')
      : '无'
    return [
      '你是务实的个人财务顾问，基于以下已由系统算好的数据（单位：元）回答用户：',
      `想买的东西：${analysis.itemName}，价格 ${f(analysis.price)}`,
      `存钱罐已攒 ${f(analysis.alreadySaved)}；若现在购买还需从账户补 ${f(analysis.gap)}`,
      `账户总余额 ${f(totalBalance)}（可用 ${f(availableBalance)}${frozenBalance > 0 ? `，另有冻结 ${f(frozenBalance)} 不可动用` : ''}；各账户：${acctLine}）`,
      `立即购买后余额 ${f(analysis.balanceAfter)}，${analysis.canAfford ? '买得起' : '买不起'}`,
      analysis.daysOfSurvival < 999
        ? `按近30天日均消费 ${f(analysis.avgDailyExpense)}，买完后余额约可支撑 ${analysis.daysOfSurvival} 天日常开销`
        : '',
      `每月可存 ${f(savable.savable)}（固定收入 ${f(savable.fixedIncome)} − 固定支出 ${f(savable.fixedExpense)} + 日常月均结余 ${f(savable.variableNet)}）`,
      `其他进行中目标：${impactLine}`,
      '要求：1）所有金额一律以上述数据为准，不要自己改数或重新精算；2）先结论后理由，默认 150 字以内，用户追问再展开；3）数据不足时直说，不要编造；4）用中文；5）用纯文本，不要使用 Markdown 标记（如星号、并号、减号列表）。',
    ]
      .filter(Boolean)
      .join('\n')
  }, [analysis, accountBalances, totalBalance, availableBalance, frozenBalance, savable])

  const askAi = async (question: string) => {
    if (!question.trim() || aiBusy) return
    setAiError('')
    const history: AiChatMessage[] = [...aiChat, { role: 'user', content: question.trim() }]
    setAiChat(history)
    setAiInput('')
    setAiBusy(true)
    try {
      const r = await sendAiChat(history, systemPrompt)
      setAiChat([...history, { role: 'assistant', content: r.reply }])
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI 请求失败')
    } finally {
      setAiBusy(false)
    }
  }

  // ============ 临时模式：输入视图 ============
  if (!goal && !submitted) {
    return (
      <Modal
        isOpen={true}
        onClose={onClose}
        title="随手算算"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>取消</Button>
            <Button
              disabled={!tempName || !tempPrice || parseFloat(tempPrice) <= 0}
              onClick={() => {
                setSubmitted({ name: tempName, price: yuanToCent(parseFloat(tempPrice)) })
              }}
            >
              分析一下
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="物品名称"
            placeholder="例如：游戏机、新手机"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
          />
          <Input
            label="价格"
            type="number"
            placeholder="0.00"
            value={tempPrice}
            onChange={(e) => setTempPrice(e.target.value)}
            step="0.01"
            min="0"
          />
          <p className="text-xs text-charcoal-300">
            还没想好要不要加入愿望清单？先算算买它划不划算。
          </p>
        </div>
      </Modal>
    )
  }

  // ============ 分析结果视图 ============
  if (!analysis) return null

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      className={aiReady ? 'max-w-3xl' : 'max-w-2xl'}
      title={goal ? `现在买会怎样 - ${goal.name}` : `购买分析 - ${analysis.itemName}`}
      footer={
        <>
          {goal ? (
            <>
              <Button variant="secondary" onClick={onClose}>继续攒</Button>
              {analysis.canAfford && goal.status !== 'completed' && (
                <Button onClick={handleBuyNow}>现在就买</Button>
              )}
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setSubmitted(null)}>再算一个</Button>
              <Button variant="secondary" onClick={handleCoolDown}>
                <Hourglass className="w-4 h-4 mr-1.5" />
                先冷静一下
              </Button>
              <Button onClick={handleSaveAsGoal}>存为想买的东西</Button>
            </>
          )}
        </>
      }
    >
      <div>
        {/* 第一层：核心结论，横贯整行 */}
        <div
          className={`rounded-lg p-4 border-l-4 ${
            analysis.canAfford ? 'border-olive bg-olive-50' : 'border-terra bg-terra-50'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            {analysis.canAfford ? (
              <CheckCircle2 className="w-5 h-5 text-olive shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-terra shrink-0" />
            )}
            <h4 className={`font-medium ${analysis.canAfford ? 'text-olive' : 'text-terra'}`}>
              {analysis.canAfford ? '买得起，账上够补差额' : '还差一点，买不起'}
            </h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-charcoal-300 mb-0.5">物品价格</p>
              <p className="text-sm font-semibold text-charcoal tabular-nums">{formatMoney(analysis.price)}</p>
            </div>
            <div>
              <p className="text-xs text-charcoal-300 mb-0.5">存钱罐已攒</p>
              <p className="text-sm font-semibold text-charcoal tabular-nums">{formatMoney(analysis.alreadySaved)}</p>
            </div>
            <div>
              <p className="text-xs text-charcoal-300 mb-0.5">还需从账户补</p>
              <p className="text-sm font-semibold text-brown tabular-nums">{formatMoney(analysis.gap)}</p>
            </div>
            <div>
              <p className="text-xs text-charcoal-300 mb-0.5">买完后可用余额</p>
              <p
                className={`text-sm font-semibold tabular-nums ${
                  analysis.balanceAfter >= 0 ? 'text-olive' : 'text-terra'
                }`}
              >
                {formatMoney(analysis.balanceAfter)}
              </p>
            </div>
          </div>
          {!analysis.canAfford && (
            <p className="text-xs text-terra mt-3 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 shrink-0" />
              还差 {formatMoney(Math.abs(analysis.balanceAfter))}，按每月可存 {formatMoney(monthlySavable)} 还需攒
              {monthlySavable > 0 ? Math.ceil(Math.abs(analysis.balanceAfter) / monthlySavable) : '?'} 个月
            </p>
          )}
          {analysis.canAfford && analysis.daysOfSurvival < 14 && (
            <p className="text-xs text-terra mt-3 flex items-center gap-1">
              <Lightbulb className="w-3.5 h-3.5 shrink-0" />
              {analysis.daysOfSurvival === 999
                ? '买完后账户基本清空，请谨慎考虑'
                : `买完后余额只够支撑 ${analysis.daysOfSurvival} 天日常开销，建议谨慎考虑`}
            </p>
          )}
        </div>

        {/* 第二层：支撑面板并排；AI 已配置时为三列，AI 独占一列 */}
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5 ${
            aiReady ? 'lg:grid-cols-3 items-stretch' : 'items-start'
          }`}
        >
          {/* 左：每月能存多少（周期性收支 + 日常结余拆解） */}
          <div className="flex flex-col">
            <h4 className="text-sm font-medium text-charcoal-400 mb-2">每月能存多少</h4>
            <div className="bg-sand-50 rounded-lg px-3 py-2.5 space-y-1.5 text-sm flex-1">
              {savable.fixedIncome > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-charcoal-300">固定收入（工资等）</span>
                  <span className="text-olive tabular-nums">+{formatMoney(savable.fixedIncome)}</span>
                </div>
              )}
              {savable.fixedExpense > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-charcoal-300">固定支出（会员等）</span>
                  <span className="text-terra tabular-nums">−{formatMoney(savable.fixedExpense)}</span>
                </div>
              )}
              {savable.variableNet > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-charcoal-300">日常月均结余</span>
                  <span className="text-charcoal tabular-nums">+{formatMoney(savable.variableNet)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1.5 border-t border-sand-200">
                <span className="font-medium text-charcoal">每月可存</span>
                <span className="font-semibold text-brown tabular-nums">{formatMoney(monthlySavable)}</span>
              </div>
              {savable.fixedIncome === 0 && savable.fixedExpense === 0 && (
                <p className="text-xs text-charcoal-300 pt-0.5">在「固定收入 / 固定支出」页设置工资、会员等，预测会更准</p>
              )}
            </div>
          </div>

          {/* 右：账户实时余额 */}
          <div className="flex flex-col">
            <h4 className="text-sm font-medium text-charcoal-400 mb-2">账户实时余额</h4>
            <div className="bg-sand-50 rounded-lg p-2 flex-1">
              {/* 总资金 */}
              <div className="w-full flex items-center justify-between px-2.5 py-2 rounded-md text-sm">
                <span className="flex items-center gap-2 text-charcoal font-medium">
                  <Icon name="coins" className="w-4 h-4 text-brown" />
                  总资金
                </span>
                <span className={`tabular-nums font-semibold ${totalBalance < 0 ? 'text-terra' : 'text-brown'}`}>
                  {formatMoney(totalBalance)}
                </span>
              </div>

              {/* 可用余额（有冻结时展示） */}
              {frozenBalance > 0 && (
                <div className="w-full flex items-center justify-between px-2.5 py-2 rounded-md text-sm bg-[#EFF3FA]">
                  <span className="flex items-center gap-1.5 text-[#5F739E] font-medium">
                    <Snowflake className="w-4 h-4 shrink-0" />
                    可用余额
                    <span className="text-[10px] font-normal">冻结 {formatMoney(frozenBalance)} 不参与</span>
                  </span>
                  <span className={`tabular-nums font-semibold ${availableBalance < 0 ? 'text-terra' : 'text-[#5F739E]'}`}>
                    {formatMoney(availableBalance)}
                  </span>
                </div>
              )}

              {/* 分隔线 */}
              <div className="border-t border-sand-200 mx-2.5 my-1" />

              {/* 各账户 */}
              {accountBalances.map(({ account, balance }) => (
                <div
                  key={account.id}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-md text-sm"
                >
                  <span className="flex items-center gap-2 text-charcoal min-w-0">
                    <Icon name={account.icon} className="w-4 h-4 text-brown shrink-0" />
                    <span className="truncate">{account.name}</span>
                    {account.isFrozen && (
                      <span className="text-[10px] text-[#7C90BC] flex items-center gap-0.5 shrink-0">
                        <Snowflake className="w-3 h-3" />
                        {account.frozenNote || '已冻结'}
                      </span>
                    )}
                  </span>
                  <span className={`tabular-nums font-medium shrink-0 ml-2 ${balance < 0 ? 'text-terra' : 'text-charcoal'}`}>
                    {formatMoney(balance)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-charcoal-300 mt-2">
              {goal
                ? `「现在就买」将从可用资金按各账户余额比例扣减差额${frozenBalance > 0 ? '（冻结的钱不会动）' : ''}`
                : '存为想买的东西后，攒钱时从选定账户划入存钱罐'}
            </p>
          </div>

          {/* 第三列（AI 已配置时）：AI 建议，常驻对话面板 */}
          {aiReady && (
            <div className="flex flex-col">
              <h4 className="text-sm font-medium text-charcoal-400 mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brown" />
                AI 建议
              </h4>
              <div className="bg-sand-50 rounded-lg flex flex-col flex-1 min-h-[17rem]">
                {aiChat.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2.5 p-4 text-center">
                    <Sparkles className="w-6 h-6 text-brown" />
                    <p className="text-xs text-charcoal-300 leading-relaxed">
                      基于左侧数据给出值不值得买的建议，还可以继续追问
                    </p>
                    <Button
                      size="sm"
                      onClick={() => askAi('请结合以上数据，给我是否现在购买的建议')}
                      disabled={aiBusy}
                    >
                      问问 AI 值不值得买
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 min-h-0">
                      {aiChat.map((m, i) => (
                        <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                          <div
                            className={`inline-block max-w-[92%] px-2.5 py-1.5 rounded-lg text-sm text-left whitespace-pre-wrap break-words ${
                              m.role === 'user'
                                ? 'bg-brown text-white'
                                : 'bg-white text-charcoal'
                            }`}
                          >
                            {m.content}
                          </div>
                        </div>
                      ))}
                      {aiBusy && (
                        <p className="text-xs text-charcoal-300 flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3 animate-pulse" />
                          AI 思考中…
                        </p>
                      )}
                      <div ref={chatBottomRef} />
                    </div>
                    {aiError && <p className="text-xs text-terra px-2.5 pt-1">{aiError}</p>}
                    <div className="flex gap-1.5 p-2 border-t border-sand-200">
                      <input
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) askAi(aiInput)
                        }}
                        placeholder="继续追问…"
                        className="flex-1 min-w-0 px-2.5 py-1.5 text-sm bg-white border border-sand-200 rounded-lg
                          focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown"
                      />
                      <Button size="sm" onClick={() => askAi(aiInput)} disabled={!aiInput.trim() || aiBusy}>
                        <Send className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 第三层：对其他目标的影响，横贯整行 */}
        {analysis.goalImpacts.length > 0 && (
          <div className="mt-5">
            <h4 className="text-sm font-medium text-charcoal-400 mb-2">对其他想买的东西的影响</h4>
            <div className="space-y-2">
              {analysis.goalImpacts.map((impact) => (
                <div key={impact.goalId} className="flex items-center justify-between bg-sand-50 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon name={impact.goalIcon} className="w-4 h-4 text-brown shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-charcoal truncate">{impact.goalName}</p>
                      <p className="text-xs text-charcoal-300">
                        进度 {impact.currentProgress}% · 还需 {formatMoney(impact.remaining)}
                      </p>
                    </div>
                  </div>
                  {impact.delayedMonths > 0 ? (
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-medium text-terra">推迟 {impact.delayedMonths} 个月</p>
                      <p className="text-xs text-charcoal-300">
                        {format(impact.originalEndDate, 'yyyy年M月')} → {format(impact.newEndDate, 'yyyy年M月')}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-olive shrink-0 ml-2">不受影响</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
