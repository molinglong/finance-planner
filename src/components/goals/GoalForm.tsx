import { useState, useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'
import { yuanToCent, formatMoney, getToday } from '../../utils/format'
import { computeAccountBalances } from '../../utils/purchaseAnalysis'
import { SOFT_PALETTE, DUSTY_PALETTE } from '../../utils/colors'
import Modal from '../ui/Modal'
import Icon, { GOAL_ICON_OPTIONS } from '../ui/Icon'
import Button from '../ui/Button'
import Input from '../ui/Input'

interface GoalFormProps {
  isOpen: boolean
  onClose: () => void
}

const colorOptions = [...SOFT_PALETTE, ...DUSTY_PALETTE]

export default function GoalForm({ isOpen, onClose }: GoalFormProps) {
  const addGoal = useAppStore(state => state.addGoal)
  const addGoalTransaction = useAppStore(state => state.addGoalTransaction)
  const accounts = useAppStore(state => state.accounts)
  const transactions = useAppStore(state => state.transactions)

  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [currentAmount, setCurrentAmount] = useState('')
  const [deadline, setDeadline] = useState('')
  const [icon, setIcon] = useState(GOAL_ICON_OPTIONS[0])
  const [color, setColor] = useState(colorOptions[0])
  const [sourceAccountId, setSourceAccountId] = useState('')

  // 账户实时余额
  const accountBalances = useMemo(
    () => computeAccountBalances(accounts, transactions),
    [accounts, transactions]
  )
  const totalBalance = accountBalances.reduce((sum, { balance }) => sum + balance, 0)

  // 「已经攒了多少」联动：计划划入金额 + 划出后余额预览
  const plannedAmount = currentAmount ? yuanToCent(parseFloat(currentAmount) || 0) : 0

  const preview = useMemo(() => {
    if (plannedAmount <= 0 || !sourceAccountId) {
      return accountBalances.map(ab => ({ ...ab, projected: ab.balance, deduct: 0 }))
    }
    if (sourceAccountId === 'all') {
      // 与 appStore.addGoalTransaction 同规则：按正余额比例分摊，且仅非冻结账户参与（冻结的钱不能划出）
      const positives = accountBalances
        .filter(ab => !ab.account.isFrozen)
        .map(ab => ({ ...ab, pos: Math.max(0, ab.balance) }))
      const total = positives.reduce((s, ab) => s + ab.pos, 0)
      let remaining = plannedAmount
      return accountBalances.map(ab => {
        const matched = positives.find(p => p.account.id === ab.account.id)
        const ratio = total > 0 && matched ? matched.pos / total : 0
        const deduct = matched ? Math.min(matched.pos, Math.min(Math.round(plannedAmount * ratio), remaining)) : 0
        remaining -= deduct
        return { ...ab, projected: ab.balance - deduct, deduct }
      })
    }
    return accountBalances.map(ab =>
      ab.account.id === sourceAccountId
        ? { ...ab, projected: ab.balance - plannedAmount, deduct: plannedAmount }
        : { ...ab, projected: ab.balance, deduct: 0 }
    )
  }, [accountBalances, plannedAmount, sourceAccountId])

  const projectedTotal = sourceAccountId && plannedAmount > 0 ? totalBalance - plannedAmount : totalBalance

  // 校验：已填金额但未选来源 / 来源余额不足（负余额按 0 计）；与实际划转一致，冻结账户不参与
  const positiveTotal = accountBalances
    .filter(ab => !ab.account.isFrozen)
    .reduce((s, ab) => s + Math.max(0, ab.balance), 0)
  const selectedAb = accountBalances.find(ab => ab.account.id === sourceAccountId)
  const frozenPicked = plannedAmount > 0 && !!selectedAb?.account.isFrozen
  const available = sourceAccountId === 'all'
    ? positiveTotal
    : (selectedAb && !selectedAb.account.isFrozen ? selectedAb.balance : 0)
  const needSource = plannedAmount > 0 && !sourceAccountId
  const insufficient = plannedAmount > 0 && !!sourceAccountId && !frozenPicked && plannedAmount > Math.max(0, available)
  
  const handleSubmit = async () => {
    if (!name || !targetAmount) return
    if (needSource || insufficient || frozenPicked) return

    // 目标以 0 创建，初始金额通过真实划转写入（保持资金守恒）
    const goalId = await addGoal({
      name,
      targetAmount: yuanToCent(parseFloat(targetAmount)),
      currentAmount: 0,
      deadline: deadline || undefined,
      icon,
      color,
      status: 'active',
    })

    if (plannedAmount > 0) {
      await addGoalTransaction({
        goalId,
        type: 'deposit',
        amount: plannedAmount,
        accountId: sourceAccountId,
        date: getToday(),
        createdAt: Date.now(),
      } as any)
    }

    // Reset
    setName('')
    setTargetAmount('')
    setCurrentAmount('')
    setDeadline('')
    setIcon(GOAL_ICON_OPTIONS[0])
    setColor(colorOptions[0])
    setSourceAccountId('')
    onClose()
  }
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-2xl"
      title="添加想买的东西"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={!name || !targetAmount || needSource || insufficient || frozenPicked}>创建</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
        {/* 左列：表单 */}
        <div className="space-y-4">
        {/* Name */}
        <Input
          label="想买什么？"
          placeholder="例如：新手机、游戏机、旅行"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        
        {/* Target Amount */}
        <Input
          label="需要多少钱？"
          type="number"
          placeholder="0.00"
          value={targetAmount}
          onChange={(e) => setTargetAmount(e.target.value)}
          step="0.01"
          min="0"
        />
        
        {/* Current Amount */}
        <Input
          label="已经攒了多少？（可选）"
          type="number"
          placeholder="0.00"
          value={currentAmount}
          onChange={(e) => setCurrentAmount(e.target.value)}
          step="0.01"
          min="0"
        />
        
        {/* Deadline */}
        <Input
          label="希望什么时候买到？（可选）"
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
        
        {/* Icon */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-charcoal-400">图标</label>
          <div className="flex gap-2 flex-wrap">
            {GOAL_ICON_OPTIONS.map((i) => (
              <button
                key={i}
                className={`w-10 h-10 rounded-lg flex items-center justify-center
                  ${icon === i ? 'bg-brown text-white' : 'bg-sand-100 hover:bg-sand-200'}`}
                onClick={() => setIcon(i)}
              >
                <Icon name={i} className="w-5 h-5" />
              </button>
            ))}
          </div>
        </div>
        
        {/* Color */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-charcoal-400">颜色</label>
          <div className="flex gap-2">
            {colorOptions.map((c) => (
              <button
                key={c}
                className={`w-8 h-8 rounded-full border-2 ${
                  color === c ? 'border-charcoal' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        </div>

        {/* 右列：账户实时余额（已攒金额的资金来源） */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-charcoal-400">
            账户实时余额{plannedAmount > 0 && <span className="text-brown"> · 点击选择资金来源</span>}
          </label>
          <div className="bg-sand-50 rounded-lg p-2 space-y-1">
            {/* 总资金 */}
            <button
              type="button"
              onClick={() => setSourceAccountId('all')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-sm transition-colors ${
                sourceAccountId === 'all'
                  ? 'bg-white border border-brown-200'
                  : 'border border-transparent hover:bg-sand-100'
              }`}
            >
              <span className="flex items-center gap-2 text-charcoal">
                <Icon name="coins" className="w-4 h-4 text-brown" />
                总资金
              </span>
              <span className="flex items-baseline gap-1.5 shrink-0">
                {projectedTotal !== totalBalance && (
                  <span className="text-xs text-terra tabular-nums">−{formatMoney(plannedAmount)}</span>
                )}
                <span className={`tabular-nums font-medium ${projectedTotal < 0 ? 'text-terra' : 'text-charcoal'}`}>
                  {formatMoney(projectedTotal)}
                </span>
              </span>
            </button>

            {/* 各账户（冻结账户不可选：钱不能从冻结账户划出） */}
            {preview.map(({ account, projected, deduct }) => {
              const selected = sourceAccountId === account.id
              const isFrozen = account.isFrozen
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => { if (!isFrozen) setSourceAccountId(account.id) }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-sm transition-colors ${
                    isFrozen
                      ? 'opacity-50 cursor-not-allowed border border-transparent'
                      : selected
                        ? 'bg-white border border-brown-200'
                        : 'border border-transparent hover:bg-sand-100'
                  }`}
                  title={isFrozen ? `已冻结${account.frozenNote ? '：' + account.frozenNote : ''}，不能划出` : undefined}
                >
                  <span className="flex items-center gap-2 text-charcoal min-w-0">
                    <Icon name={account.icon} className="w-4 h-4 text-brown shrink-0" />
                    <span className="truncate">
                      {account.name}
                      {isFrozen && <span className="ml-1 text-[10px] text-[#7C90BC]">❄ 已冻结</span>}
                      {deduct > 0 && (
                        <span className="block text-xs text-terra">划出 {formatMoney(deduct)}</span>
                      )}
                    </span>
                  </span>
                  <span className={`tabular-nums font-medium shrink-0 ml-2 ${projected < 0 ? 'text-terra' : 'text-charcoal'}`}>
                    {formatMoney(projected)}
                  </span>
                </button>
              )
            })}
          </div>
          {needSource ? (
            <p className="text-xs text-terra">已填「已经攒了多少」，请点击上方账户选择资金来源</p>
          ) : frozenPicked ? (
            <p className="text-xs text-terra">所选账户已冻结（{selectedAb?.account.frozenNote || '如老婆本'}），这笔钱不能划出，请换一个来源</p>
          ) : insufficient ? (
            <p className="text-xs text-terra">余额不足！所选资金只有 {formatMoney(Math.max(0, available))}</p>
          ) : (
            <p className="text-xs text-charcoal-300">
              填「已经攒了多少」并选择来源，创建时这笔钱会真实转入存钱罐；不填则只创建目标
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
