import { useState } from 'react'
import { Flame } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { goalRepo } from '../../db/goals'
import { yuanToCent } from '../../utils/format'
import { COOLING_PRESETS, recommendCoolingDays } from '../../utils/savingInsights'
import { GOAL_ICON_OPTIONS } from '../ui/Icon'
import Icon from '../ui/Icon'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import { toast } from '../ui/Toast'

const SOURCE_OPTIONS = [
  { value: '抖音种草', label: '抖音种草' },
  { value: '淘宝/京东', label: '淘宝/京东' },
  { value: '朋友推荐', label: '朋友推荐' },
  { value: '线下偶遇', label: '线下偶遇' },
  { value: '其他', label: '其他' },
]

interface WishFormProps {
  isOpen: boolean
  onClose: () => void
}

/** 记下心动：加入购物冷静期（status='cooling'），倒计时内不可购买 */
export default function WishForm({ isOpen, onClose }: WishFormProps) {
  const refreshGoals = useAppStore(state => state.refreshGoals)

  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [icon, setIcon] = useState('shopping-bag')
  const [source, setSource] = useState('抖音种草')
  const [reason, setReason] = useState('')
  const [days, setDays] = useState<number | null>(null) // null = 跟随价格智能推荐
  const [submitting, setSubmitting] = useState(false)

  const priceCent = parseFloat(price) > 0 ? yuanToCent(parseFloat(price)) : 0
  const recommended = recommendCoolingDays(priceCent || 0)
  const effectiveDays = days ?? recommended
  const presetLabel = COOLING_PRESETS.find(p => p.days === effectiveDays)?.label ?? `${effectiveDays} 天`

  const priceChanged = (v: string) => {
    setPrice(v)
    setDays(null) // 价格变了重新推荐（用户手动选过后也重新跟随，保持简单）
  }

  const handleSubmit = async () => {
    if (!name.trim() || priceCent <= 0 || submitting) return
    setSubmitting(true)
    try {
      await goalRepo.create({
        name: name.trim(),
        targetAmount: priceCent,
        currentAmount: 0,
        deadline: undefined,
        icon,
        color: '#EFC8C8',
        status: 'cooling',
        coolingEndsAt: Date.now() + effectiveDays * 86400000,
        source,
        reason: reason.trim() || undefined,
      })
      await refreshGoals()
      toast(`已记下心动，冷静 ${presetLabel} 后再决定`, 'success')
      reset()
      onClose()
    } catch {
      toast('保存失败，请重试', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setName('')
    setPrice('')
    setIcon('shopping-bag')
    setSource('抖音种草')
    setReason('')
    setDays(null)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="记下心动"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || priceCent <= 0 || submitting}
          >
            <Flame className="w-4 h-4 mr-1.5" />
            开始冷静
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="物品名称"
          placeholder="例如：刷到的机械键盘"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <Input
          label="价格"
          type="number"
          placeholder="0.00"
          value={price}
          onChange={(e) => priceChanged(e.target.value)}
          step="0.01"
          min="0"
        />

        <div>
          <label className="block text-sm font-medium text-charcoal-400 mb-1.5">图标</label>
          <div className="grid grid-cols-10 gap-1.5">
            {GOAL_ICON_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setIcon(opt)}
                className={`aspect-square rounded-lg flex items-center justify-center border transition-colors
                  ${icon === opt ? 'border-brown bg-sand-100 text-brown' : 'border-sand-200 text-charcoal-300 hover:border-sand-200/80 hover:text-charcoal'}`}
              >
                <Icon name={opt} className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>

        <Select
          label="在哪被种草的"
          options={SOURCE_OPTIONS}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />

        <div>
          <label className="block text-sm font-medium text-charcoal-400 mb-1.5">
            心动理由 <span className="text-xs font-normal text-charcoal-300">（给 AI 拷问官看的）</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例如：博主说打字手感超好，看着很解压…"
            rows={2}
            className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg resize-none
              focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-charcoal-400 mb-1.5">冷静多久</label>
          <div className="grid grid-cols-3 gap-2">
            {COOLING_PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setDays(p.days)}
                className={`relative py-2 text-sm rounded-lg border transition-colors
                  ${effectiveDays === p.days
                    ? 'border-brown bg-sand-100 text-brown font-medium'
                    : 'border-sand-200 text-charcoal-300 hover:text-charcoal'}`}
              >
                {p.label}
                {days === null && recommended === p.days && priceCent > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 text-[10px] leading-none rounded bg-olive-50 text-olive">
                    推荐
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-charcoal-300 mt-1.5">
            冷静期内不能购买也不能转正，只能放弃或找 AI 拷问；到期后由你拍板。
          </p>
        </div>
      </div>
    </Modal>
  )
}
