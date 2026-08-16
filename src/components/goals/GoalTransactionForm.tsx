import { useState, useMemo } from 'react'
import { Snowflake } from 'lucide-react'
import { Goal } from '../../types'
import { useAppStore } from '../../stores/appStore'
import { getToday, yuanToCent, formatMoney } from '../../utils/format'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Icon from '../ui/Icon'

interface GoalTransactionFormProps {
  goal: Goal
  onClose: () => void
}

export default function GoalTransactionForm({ goal, onClose }: GoalTransactionFormProps) {
  const addGoalTransaction = useAppStore(state => state.addGoalTransaction)
  const accounts = useAppStore(state => state.accounts)
  const transactions = useAppStore(state => state.transactions)
  const type = (goal as any)._type as 'deposit' | 'withdraw'
  
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [date, setDate] = useState(getToday())
  const [note, setNote] = useState('')
  
  // 动态计算各账户余额
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
  
  const totalBalance = accountBalances.reduce((sum, { balance }) => sum + balance, 0)
  // 可用余额：冻结账户（如“老婆本”）不参与划出
  const frozenTotal = accountBalances.filter(b => b.account.isFrozen).reduce((sum, { balance }) => sum + balance, 0)
  const availableTotal = totalBalance - frozenTotal
  
  const amountCent = amount ? yuanToCent(parseFloat(amount)) : 0
  const selectedIsAll = accountId === 'all'
  const selectedEntry = accountBalances.find(a => a.account.id === accountId)
  const selectedFrozen = !selectedIsAll && !!selectedEntry?.account.isFrozen
  const availableBalance = selectedIsAll ? availableTotal : (selectedEntry?.balance ?? 0)
  const insufficient = amountCent > availableBalance
  const blockedByFreeze = type === 'deposit' && selectedFrozen
  
  const handleSubmit = async () => {
    if (!amount || !accountId) return
    if (type === 'deposit' && (insufficient || blockedByFreeze)) return
    
    await addGoalTransaction({
      goalId: goal.id,
      type,
      amount: amountCent,
      accountId, // 资金来源/去向账户（'all' = 总资金）
      date,
      note: note || undefined,
      createdAt: Date.now(),
    } as any)
    
    onClose()
  }
  
  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      className="max-w-2xl"
      title={type === 'deposit' ? `攒钱 - ${goal.name}` : `取用 - ${goal.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button 
            variant={type === 'deposit' ? 'primary' : 'danger'}
            onClick={handleSubmit} 
            disabled={!amount || !accountId || (type === 'deposit' && (insufficient || blockedByFreeze))}
          >
            确认{type === 'deposit' ? '攒钱' : '取用'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* 左列：表单 */}
        <div className="space-y-4">
          <div className="bg-sand-100 rounded-lg p-4 text-center">
            <p className="text-sm text-charcoal-300 mb-1">当前已攒</p>
            <p className="text-2xl font-semibold text-charcoal tabular-nums">
              {formatMoney(goal.currentAmount)}
            </p>
          </div>

          <Input
            label="金额"
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            min="0"
          />

          {/* 资金来源选择 */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-charcoal-400">
              {type === 'deposit' ? '从哪个账户划入？' : '取回到哪个账户？'}
            </label>
            <select
              className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">请选择账户</option>
              <option value="all">
                {type === 'deposit'
                  ? `可用资金（非冻结账户合计 ${formatMoney(availableTotal)}）`
                  : `总资金（所有账户合计 ${formatMoney(totalBalance)}）`}
              </option>
              {accountBalances.map(({ account, balance }) => (
                <option 
                  key={account.id} 
                  value={account.id}
                  disabled={type === 'deposit' && account.isFrozen}
                >
                  {account.name}（{formatMoney(balance)}）{account.isFrozen ? ` · 已冻结${account.frozenNote ? `（${account.frozenNote}）` : ''}` : ''}
                </option>
              ))}
            </select>
            {type === 'deposit' && blockedByFreeze && (
              <p className="text-xs text-[#7C90BC] mt-1">
                「{selectedEntry?.account.name}」已冻结{selectedEntry?.account.frozenNote ? `（${selectedEntry.account.frozenNote}）` : ''}，不能从这里划出
              </p>
            )}
            {type === 'deposit' && !blockedByFreeze && amountCent > 0 && insufficient && (
              <p className="text-xs text-terra mt-1">
                余额不足！当前可选资金只有 {formatMoney(availableBalance)}
              </p>
            )}
          </div>

          <Input
            label="日期"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

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

        {/* 右列：账户实时余额 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-charcoal-400">账户实时余额</label>
          <div className="bg-sand-50 rounded-lg p-2 space-y-1">
            {/* 总资金 */}
            <button
              type="button"
              onClick={() => setAccountId('all')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-sm transition-colors ${
                accountId === 'all'
                  ? 'bg-white border border-brown-200'
                  : 'border border-transparent hover:bg-sand-100'
              }`}
            >
              <span className="flex items-center gap-2 text-charcoal">
                <Icon name="coins" className="w-4 h-4 text-brown" />
                {type === 'deposit' ? '可用资金' : '总资金'}
              </span>
              <span className="flex flex-col items-end">
                <span className={`tabular-nums font-medium ${availableTotal < 0 && type === 'deposit' ? 'text-terra' : 'text-charcoal'}`}>
                  {formatMoney(type === 'deposit' ? availableTotal : totalBalance)}
                </span>
                {type === 'deposit' && frozenTotal > 0 && (
                  <span className="text-[10px] text-[#7C90BC] flex items-center gap-0.5">
                    <Snowflake className="w-3 h-3" />
                    另有冻结 {formatMoney(frozenTotal)}
                  </span>
                )}
              </span>
            </button>

            {/* 各账户 */}
            {accountBalances.map(({ account, balance }) => {
              const selected = accountId === account.id
              const frozenBlocked = type === 'deposit' && account.isFrozen
              return (
                <button
                  key={account.id}
                  type="button"
                  disabled={frozenBlocked}
                  onClick={() => setAccountId(account.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-sm transition-colors ${
                    frozenBlocked
                      ? 'opacity-50 cursor-not-allowed border border-transparent'
                      : selected
                        ? 'bg-white border border-brown-200'
                        : 'border border-transparent hover:bg-sand-100'
                  }`}
                >
                  <span className="flex items-center gap-2 text-charcoal">
                    <Icon name={account.icon} className="w-4 h-4 text-brown" />
                    {account.name}
                    {account.isFrozen && (
                      <span className="text-[10px] text-[#7C90BC] flex items-center gap-0.5">
                        <Snowflake className="w-3 h-3" />
                        {account.frozenNote || '已冻结'}
                      </span>
                    )}
                  </span>
                  <span className={`tabular-nums font-medium ${balance < 0 ? 'text-terra' : 'text-charcoal'}`}>
                    {formatMoney(balance)}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-charcoal-300">
            点击选择{type === 'deposit' ? '划出账户（冻结账户不能选）' : '存入账户'}
          </p>
        </div>
      </div>
    </Modal>
  )
}
