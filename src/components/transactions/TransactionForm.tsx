import { useState, useEffect } from 'react'
import { Category, Transaction, TransactionType } from '../../types'
import { useAppStore } from '../../stores/appStore'
import { getToday, yuanToCent } from '../../utils/format'
import { fetchAiConfig, sendAiChat } from '../../api/ai'
import { buildSmartEntrySystemPrompt, parseSmartEntryReply } from '../../utils/smartEntry'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import { Sparkles, CheckCircle2 } from 'lucide-react'

interface TransactionFormProps {
  isOpen: boolean
  onClose: () => void
  categories: Category[]
  editTransaction?: Transaction | null
}

export default function TransactionForm({ isOpen, onClose, categories, editTransaction }: TransactionFormProps) {
  const accounts = useAppStore(state => state.accounts)
  const addTransaction = useAppStore(state => state.addTransaction)
  const updateTransaction = useAppStore(state => state.updateTransaction)
  const getDefaultCategoryId = useAppStore(state => state.getDefaultCategoryId)
  
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [date, setDate] = useState(getToday())
  const [note, setNote] = useState('')
  
  // ============ 智能记账（AI 已配置且非编辑模式时显示） ============
  const [aiReady, setAiReady] = useState(false)
  const [nlInput, setNlInput] = useState('')
  const [nlBusy, setNlBusy] = useState(false)
  const [nlError, setNlError] = useState('')
  const [nlDone, setNlDone] = useState(false)

  useEffect(() => {
    fetchAiConfig()
      .then(cfg => setAiReady(cfg.configured))
      .catch(() => setAiReady(false))
  }, [])
  
  const isEditing = !!editTransaction
  const filteredCategories = categories.filter(c => c.type === type)
  
  // 打开时填充/重置表单
  useEffect(() => {
    if (!isOpen) return
    setNlError('')
    setNlDone(false)
    
    if (editTransaction) {
      setType(editTransaction.type)
      setAmount((editTransaction.amount / 100).toString())
      setCategoryId(editTransaction.categoryId)
      // 从账户交易关联中找回 accountId — 暂时用第一个账户
      setAccountId('')
      setDate(editTransaction.date)
      setNote(editTransaction.note || '')
    } else {
      setType('expense')
      setAmount('')
      setCategoryId('')
      setAccountId('')
      setDate(getToday())
      setNote('')
    }
  }, [isOpen, editTransaction])
  
  // 一句话解析：AI 提取字段，本地校验后预填表单，保存仍走原有流程
  const handleSmartFill = async () => {
    const text = nlInput.trim()
    if (!text || nlBusy) return
    setNlError('')
    setNlDone(false)
    setNlBusy(true)
    try {
      const today = getToday()
      const prompt = buildSmartEntrySystemPrompt(categories, accounts, today)
      const r = await sendAiChat([{ role: 'user', content: text }], prompt)
      const draft = parseSmartEntryReply(r.reply, categories, accounts, today)
      if (!draft) {
        setNlError('没认出这笔账，换个说法试试，或直接手动填写')
        return
      }
      setType(draft.type)
      setAmount(String(draft.amount))
      setCategoryId(draft.categoryId)
      if (draft.accountId) {
        // 智能记账预填：支出不允许落在冻结账户（如老婆本），与手动选择限制一致
        const acc = accounts.find(a => a.id === draft.accountId)
        if (!(draft.type === 'expense' && acc?.isFrozen)) setAccountId(draft.accountId)
      }
      setDate(draft.date)
      setNote(draft.note)
      setNlDone(true)
    } catch (err) {
      setNlError(err instanceof Error ? err.message : 'AI 请求失败，请稍后再试')
    } finally {
      setNlBusy(false)
    }
  }

  // 冻结账户（如“老婆本”）不能作为支出账户：切换到支出时若选中则清空
  useEffect(() => {
    if (type === 'expense') {
      const acc = accounts.find(a => a.id === accountId)
      if (acc?.isFrozen) setAccountId('')
    }
  }, [type, accountId, accounts])

  const handleSubmit = async () => {
    if (!amount) return
    if (!isEditing && type === 'expense' && accounts.find(a => a.id === accountId)?.isFrozen) return
    
    const finalCategoryId = categoryId || getDefaultCategoryId(type)
    
    if (isEditing && editTransaction) {
      await updateTransaction(editTransaction.id, {
        type,
        amount: yuanToCent(parseFloat(amount)),
        categoryId: finalCategoryId,
        date,
        note: note || undefined,
      })
    } else {
      if (!accountId) return
      await addTransaction({
        type,
        amount: yuanToCent(parseFloat(amount)),
        categoryId: finalCategoryId,
        accountId,
        date,
        note: note || undefined,
      })
    }
    
    onClose()
  }
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? '编辑记录' : '添加记录'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={!amount || (!isEditing && !accountId)}>保存</Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Smart Entry — AI 已配置且非编辑模式时显示 */}
        {!isEditing && aiReady && (
          <div className="rounded-lg bg-sand-50 border border-sand-200 p-3 space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Sparkles className="w-3.5 h-3.5 text-brown shrink-0" />
              <span className="text-sm font-medium text-charcoal">智能记账</span>
              <span className="text-xs text-charcoal-300">说一句话自动填表，保存前可修改</span>
            </div>
            <div className="flex gap-2">
              <input
                value={nlInput}
                onChange={(e) => { setNlInput(e.target.value); setNlDone(false) }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSmartFill()
                }}
                disabled={nlBusy}
                placeholder="例如：昨天午饭 35，微信付的"
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown"
              />
              <Button size="sm" onClick={handleSmartFill} disabled={nlBusy || !nlInput.trim()}>
                {nlBusy ? '解析中…' : 'AI 填表'}
              </Button>
            </div>
            {nlBusy && (
              <p className="text-xs text-charcoal-300 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 animate-pulse" />
                AI 正在解析…
              </p>
            )}
            {!nlBusy && nlError && <p className="text-xs text-terra">{nlError}</p>}
            {!nlBusy && !nlError && nlDone && (
              <p className="text-xs text-olive flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                已填入下方表单，确认无误后保存
              </p>
            )}
          </div>
        )}
        
        {/* Type Toggle */}
        <div className="flex gap-2 p-1 bg-sand-100 rounded-lg">
          <button
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              type === 'expense'
                ? 'bg-terra text-white'
                : 'text-charcoal-300 hover:text-charcoal'
            }`}
            onClick={() => { setType('expense'); setCategoryId(''); }}
          >
            支出
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              type === 'income'
                ? 'bg-olive text-white'
                : 'text-charcoal-300 hover:text-charcoal'
            }`}
            onClick={() => { setType('income'); setCategoryId(''); }}
          >
            收入
          </button>
        </div>
        
        {/* Amount */}
        <Input
          label="金额"
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          step="0.01"
          min="0"
        />
        
        {/* Account — 编辑模式下不显示（accountId 不在 Transaction 上） */}
        {!isEditing && (
          <Select
            label="支付账户"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            options={[
              { value: '', label: type === 'expense' ? '请选择账户（冻结账户不可支出）' : '请选择账户' },
              ...accounts.map(a => ({
                value: a.id, 
                label: a.isFrozen ? `${a.name}（已冻结${a.frozenNote ? '·' + a.frozenNote : ''}）` : a.name,
                disabled: type === 'expense' && a.isFrozen,
              })),
            ]}
          />
        )}
        
        {/* Category */}
        <Select
          label="分类（可选）"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          options={[
            { value: '', label: '默认：未分类' },
            ...filteredCategories.map(c => ({ value: c.id, label: c.name })),
          ]}
        />
        
        {/* Date */}
        <Input
          label="日期"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        
        {/* Note */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-charcoal-400">备注</label>
          <textarea
            className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown
              resize-none"
            rows={2}
            placeholder="可选备注..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}
