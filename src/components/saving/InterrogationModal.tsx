import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Send, RotateCcw, MessageCircle } from 'lucide-react'
import { AiVerdict, Goal, InterrogationChat } from '../../types'
import { useAppStore } from '../../stores/appStore'
import { useAiPanelStore, type AiHandoffCard } from '../../stores/aiPanelStore'
import { formatMoney } from '../../utils/format'
import { fetchAiConfig, sendAiChat, type AiChatMessage } from '../../api/ai'
import {
  computeAvailableBalance,
  computeAvgDailyExpense,
  computeMonthlySavable,
} from '../../utils/purchaseAnalysis'
import Modal from '../ui/Modal'
import Button from '../ui/Button'

/** 从 AI 最后一条回复解析固定格式结论：【结论】【吃灰率】【理由】 */
function parseVerdict(text: string): AiVerdict | null {
  const v = text.match(/【结论】\s*(推荐购买|再想想|别买)/)
  if (!v) return null
  const d = text.match(/【吃灰率】\s*(\d{1,3})\s*%?/)
  const r = text.match(/【理由】\s*([^\n]+)/)
  return {
    verdict: v[1] === '推荐购买' ? 'recommend' : v[1] === '再想想' ? 'neutral' : 'avoid',
    dustRate: d ? Math.min(100, Number(d[1])) : 50,
    summary: r ? r[1].trim().slice(0, 80) : '',
    createdAt: Date.now(),
  }
}

const VERDICT_LABEL: Record<AiVerdict['verdict'], string> = {
  recommend: '推荐购买',
  neutral: '再想想',
  avoid: '别买',
}

/** 选择题选项 */
interface McOption {
  letter: string
  text: string
}

/** 选项行：A. xxx / A、xxx / A: xxx */
const OPTION_LINE_RE = /^([A-D])[.、:：]\s*(.+)$/

/** 从 AI 最后一条回复解析选择题选项；非选择题返回 null */
function parseMcQuestion(text: string): McOption[] | null {
  if (text.includes('【结论】')) return null
  const options: McOption[] = []
  for (const line of text.split('\n')) {
    const m = line.trim().match(OPTION_LINE_RE)
    if (m) options.push({ letter: m[1], text: m[2].trim() })
  }
  // 必须从 A 开始连续（至少 A、B），防止把无关编号内容误判成选择题
  if (options.length < 2 || options[0].letter !== 'A') return null
  for (let i = 0; i < options.length; i++) {
    if (options[i].letter !== 'ABCD'[i]) return null
  }
  // AI 忘写 D 时自动补「其他」
  if (options.length === 3) options.push({ letter: 'D', text: '其他' })
  return options.slice(0, 4)
}

/** 展示时去掉选项行（选项渲染成可点按钮，不重复出现在正文里） */
function displayText(text: string): string {
  const lines = text.split('\n')
  const kept = lines.filter(line => !OPTION_LINE_RE.test(line.trim()))
  if (kept.length === lines.length) return text
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

/** 恢复目标上已保存的问答记录（容忍脏数据，逐条校验） */
function loadSavedChat(goal: Goal): AiChatMessage[] {
  if (!Array.isArray(goal.aiChat)) return []
  return goal.aiChat
    .filter(
      (m): m is InterrogationChat =>
        !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    )
    .map(m => ({ role: m.role, content: m.content }))
}

interface InterrogationModalProps {
  goal: Goal
  onClose: () => void
}

/** AI 灵魂拷问：对话式追问 + 固定格式结论（自动保存到目标上） */
export default function InterrogationModal({ goal, onClose }: InterrogationModalProps) {
  const transactions = useAppStore(state => state.transactions)
  const accounts = useAppStore(state => state.accounts)
  const goals = useAppStore(state => state.goals)
  const recurringIncomes = useAppStore(state => state.recurringIncomes)
  const recurringExpenses = useAppStore(state => state.recurringExpenses)
  const updateGoal = useAppStore(state => state.updateGoal)
  // 实时读取（结论保存后徽章立即更新）
  const liveGoal = useAppStore(state => state.goals.find(g => g.id === goal.id)) ?? goal

  const [aiReady, setAiReady] = useState(false)
  const [aiChecked, setAiChecked] = useState(false)
  // 打开时恢复上次没聊完的问答（持久化在目标记录上，随云端同步）
  const [chat, setChat] = useState<AiChatMessage[]>(() => loadSavedChat(goal))
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [savedTip, setSavedTip] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchAiConfig()
      .then(cfg => setAiReady(cfg.configured))
      .catch(() => setAiReady(false))
      .finally(() => setAiChecked(true))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [chat, busy])

  // 问答持久化：每轮问答后把记录存回目标（静默失败，不干扰对话）
  const persistedRef = useRef(JSON.stringify(loadSavedChat(goal)))
  useEffect(() => {
    if (chat.length === 0) return
    const snapshot = JSON.stringify(chat)
    if (snapshot === persistedRef.current) return
    persistedRef.current = snapshot
    updateGoal(goal.id, { aiChat: chat }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat])

  const systemPrompt = useMemo(() => {
    const f = (n: number) => formatMoney(n)
    const { available, frozen } = computeAvailableBalance(accounts, transactions)
    const avgDaily = computeAvgDailyExpense(transactions)
    const savable = computeMonthlySavable(transactions, recurringIncomes, recurringExpenses)
    const others = goals.filter(g => g.status === 'active' && g.id !== goal.id)
    const goalLine = others.length
      ? others.map(g => `${g.name}（还差 ${f(g.targetAmount - g.currentAmount)}）`).join('、')
      : '无'
    return [
      `你是「灵魂拷问官」，帮一个容易冲动消费的用户判断要不要买「${goal.name}」（价格 ${f(goal.targetAmount)}，种草来源：${goal.source || '没说'}，心动理由：${goal.reason || '没说'}）。`,
      '他的真实财务状况（系统已算好，直接引用，禁止编造或改数）：',
      `可用余额 ${f(available)}${frozen > 0 ? `（另有冻结 ${f(frozen)} 不能动）` : ''}，近 30 天日均消费 ${f(avgDaily)}，每月可存约 ${f(savable.savable)}，其他攒钱目标：${goalLine}。`,
      '拷问规则：',
      '1. 一次只问一个问题，等他回答。总共问 3 到 5 个，围绕：真实动机（想要还是需要）、多久用一次、有没有能凑合的替代品、这个价格和他的钱袋子配不配、买回来吃灰的概率。',
      '2. 提问优先用选择题，严格按下面的格式（题干一行，紧跟四个选项行，每个选项单独占一行）：',
      '这东西买回来你多久会用一次？',
      'A. 几乎天天用',
      'B. 每周用几次',
      'C. 大概率吃灰，想不起来',
      'D. 其他',
      '选项每条不超过 12 字，D 永远固定写「其他」。只有确实要他自己展开讲的题，才不带选项直接问。',
      '3. 说话像损友：松弛、直接、可以调侃但别骂人别说教，每条不超过 60 字，不用书面腔。选择题之外的回复不要分点列条。',
      '4. 问够了，或者他说要结论，就停止提问，最后一条回复必须严格是这三行，不带任何选项：',
      '【结论】推荐购买 或 再想想 或 别买（三选一）',
      '【吃灰率】0 到 100 的整数加百分号',
      '【理由】50 字以内的大实话',
      '5. 这三行之外不要再多说一个字。全程中文纯文本，不用任何 Markdown 符号。',
    ].join('\n')
  }, [accounts, transactions, goals, recurringIncomes, recurringExpenses, goal])

  const send = async (userText: string) => {
    if (!userText.trim() || busy) return
    setError('')
    const history: AiChatMessage[] = [...chat, { role: 'user', content: userText.trim() }]
    setChat(history)
    setInput('')
    setBusy(true)
    // 用户回答先落库一份：中途关掉弹窗（AI 还在回）也不会丢这条回答
    persistedRef.current = JSON.stringify(history)
    updateGoal(goal.id, { aiChat: history }).catch(() => {})
    try {
      const r = await sendAiChat(history, systemPrompt)
      setChat([...history, { role: 'assistant', content: r.reply }])
      const v = parseVerdict(r.reply)
      if (v) {
        await updateGoal(goal.id, { aiVerdict: v })
        setSavedTip(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 请求失败')
    } finally {
      setBusy(false)
    }
  }

  const restart = () => {
    setChat([])
    setError('')
    setSavedTip(false)
    // 同步清空已保存的问答记录
    persistedRef.current = '[]'
    updateGoal(goal.id, { aiChat: null }).catch(() => {})
  }

  // 最后一条 AI 消息若是选择题，渲染成可点选项（busy 期间不显示，防连点）
  const lastMsg = chat[chat.length - 1]
  const mc = useMemo(
    () => (lastMsg && lastMsg.role === 'assistant' ? parseMcQuestion(lastMsg.content) : null),
    [lastMsg]
  )

  const pickOption = (o: McOption) => {
    if (busy) return
    if (o.letter === 'D' || o.text === '其他') {
      inputRef.current?.focus()
      return
    }
    send(o.text)
  }

  /** 把拷问上下文打包投喂给右侧 AI 助手细聊（文字给 AI，卡片数据给面板展示） */
  const sendToPanel = useAiPanelStore(s => s.sendToPanel)
  const handoffToPanel = () => {
    const v = liveGoal.aiVerdict
    // 问答摘要：每条回答带上前一问（去掉选项行），剔除开场白与催结论
    const SKIP = ['开始吧，拷问我', '好了，别问了，直接给结论吧']
    const qa: { q: string; a: string }[] = []
    chat.forEach((m, i) => {
      if (m.role === 'user' && !SKIP.includes(m.content)) {
        const q =
          i > 0 && chat[i - 1].role === 'assistant'
            ? displayText(chat[i - 1].content).replace(/\s+/g, ' ').trim()
            : ''
        qa.push({ q, a: m.content })
      }
    })
    const question = '结合我的财务情况，帮我具体分析这笔钱到底该不该花、有没有更好的安排？'
    // 发给 AI 的完整文字（卡片不参与对话，AI 只看这段）
    const lines = [
      `我想细聊一个心动物品：${goal.name}（${formatMoney(goal.targetAmount)}，种草来源：${goal.source || '没说'}${
        goal.reason ? `，心动理由：${goal.reason}` : ''
      }）。`,
      qa.length ? `刚才灵魂拷问：${qa.map(p => (p.q ? `问「${p.q}」，答「${p.a}」` : `补充「${p.a}」`)).join('；')}。` : '',
      v
        ? `拷问结论是「${VERDICT_LABEL[v.verdict]}」（预估吃灰率 ${v.dustRate}%，${v.summary || '没给理由'}）。`
        : '',
      question,
    ].filter(Boolean)
    // 面板展示用的档案卡
    const card: AiHandoffCard = {
      goalName: goal.name,
      price: goal.targetAmount,
      source: goal.source,
      reason: goal.reason,
      verdict: v ? { label: VERDICT_LABEL[v.verdict], dustRate: v.dustRate, tone: v.verdict } : undefined,
      qa: qa.slice(-5),
      question,
    }
    sendToPanel(lines.join('\n'), card)
    onClose()
  }

  const verdict = liveGoal.aiVerdict

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      className="max-w-xl"
      title={`灵魂拷问 - ${goal.name}`}
      footer={
        aiReady ? (
          <div className="flex justify-between w-full sm:!w-full">
            <Button variant="ghost" size="sm" onClick={restart} disabled={chat.length === 0 || busy}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              重新聊
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={chat.length === 0 || busy}
                onClick={() => send('好了，别问了，直接给结论吧')}
              >
                直接给结论
              </Button>
              <Button variant="ghost" onClick={onClose}>关闭</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={onClose}>关闭</Button>
        )
      }
    >
      {!aiReady ? (
        <div className="py-8 text-center space-y-3">
          <Sparkles className="w-8 h-8 text-brown mx-auto" />
          <p className="text-sm text-charcoal-300 leading-relaxed">
            {aiChecked ? '还没配置 AI 助手，配置好就能开始拷问' : '正在检查 AI 配置…'}
          </p>
          {aiChecked && (
            <Link to="/settings" className="inline-block text-sm text-brown hover:underline">
              去「设置」页配置 AI
            </Link>
          )}
        </div>
      ) : (
        <div>
          {/* 已有结论：展示结论卡 */}
          {verdict && (
            <div
              className={`rounded-lg p-3 mb-3 border-l-4 ${
                verdict.verdict === 'recommend'
                  ? 'border-olive bg-olive-50'
                  : verdict.verdict === 'avoid'
                    ? 'border-terra bg-terra-50'
                    : 'border-brown bg-sand-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-charcoal">
                  拷问结论：{VERDICT_LABEL[verdict.verdict]} · 预估吃灰率 {verdict.dustRate}%
                </p>
                {savedTip && <span className="text-[10px] text-charcoal-300 shrink-0">已保存</span>}
              </div>
              {verdict.summary && (
                <p className="text-xs text-charcoal-400 mt-1 leading-relaxed">{verdict.summary}</p>
              )}
              <button
                type="button"
                onClick={handoffToPanel}
                title="把拷问记录和结论交给右侧 AI 助手，继续深入聊"
                className="hidden lg:flex items-center gap-1.5 mt-2 text-xs text-brown hover:underline"
              >
                <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
                还有疑问？去右侧 AI 助手细聊
              </button>
            </div>
          )}

          {/* 对话区：AI 回复无边框纯文字，用户消息右侧棕色气泡 */}
          <div className="bg-sand-50 rounded-lg flex flex-col min-h-[16rem] max-h-[22rem]">
            {chat.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-center">
                <Sparkles className="w-7 h-7 text-brown" />
                <p className="text-xs text-charcoal-300 leading-relaxed max-w-[16rem]">
                  拷问官会结合你的余额、日均消费和攒钱目标，问你几个扎心的问题，
                  最后给出「买不买」的结论和吃灰率预估。
                </p>
                <Button size="sm" onClick={() => send('开始吧，拷问我')} disabled={busy}>
                  开始拷问
                </Button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {chat.map((m, i) =>
                    m.role === 'user' ? (
                      <div key={i} className="text-right">
                        <span className="inline-block max-w-[85%] px-2.5 py-1.5 rounded-lg bg-brown text-white text-sm text-left whitespace-pre-wrap break-words">
                          {m.content}
                        </span>
                      </div>
                    ) : (
                      <div key={i} className="px-0.5">
                        <p className="text-sm text-charcoal whitespace-pre-wrap break-words leading-relaxed">
                          {displayText(m.content)}
                        </p>
                        {/* 选择题：A/B/C/D 可点选项，D=其他聚焦输入框 */}
                        {i === chat.length - 1 && mc && !busy && (
                          <div className="flex flex-col gap-1.5 mt-2">
                            {mc.map(o => (
                              <button
                                key={o.letter}
                                type="button"
                                onClick={() => pickOption(o)}
                                className={`flex items-center gap-2 w-full text-left px-2.5 py-2 rounded-lg text-sm border transition-colors ${
                                  o.letter === 'D'
                                    ? 'border-dashed border-sand-300 bg-sand-50 text-charcoal-400 hover:border-brown hover:text-charcoal'
                                    : 'border-sand-200 bg-white text-charcoal hover:border-brown hover:bg-sand-50'
                                }`}
                              >
                                <span className="w-5 h-5 shrink-0 rounded-full bg-sand-100 text-brown text-[11px] font-medium flex items-center justify-center">
                                  {o.letter}
                                </span>
                                <span className="break-words">{o.text}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  )}
                  {busy && (
                    <p className="text-xs text-charcoal-300 flex items-center gap-1.5 px-0.5">
                      <Sparkles className="w-3 h-3 animate-pulse" />
                      拷问官正在想问题…
                    </p>
                  )}
                  <div ref={bottomRef} />
                </div>
                {error && <p className="text-xs text-terra px-3 pt-1.5">{error}</p>}
                <div className="flex gap-1.5 p-2 border-t border-sand-200">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(input)
                    }}
                    placeholder={mc && !busy ? '都不像？直接打字告诉它…' : '老实回答…'}
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-sm bg-white border border-sand-200 rounded-lg
                      focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown"
                    disabled={busy}
                  />
                  <Button size="sm" onClick={() => send(input)} disabled={!input.trim() || busy}>
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </>
            )}
          </div>

          <p className="text-[11px] text-charcoal-300 mt-2 leading-relaxed">
            问答和结论会自动保存在这张心动卡片上，关掉再开也能接着聊；冷静期结束时帮你做决定。
          </p>
        </div>
      )}
    </Modal>
  )
}
