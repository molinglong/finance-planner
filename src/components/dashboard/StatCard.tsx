import { ReactNode } from 'react'
import { formatMoney } from '../../utils/format'

interface StatCardProps {
  title: string
  amount: number
  icon: ReactNode
  color: 'olive' | 'terra' | 'brown'
  showSign?: boolean
}

export default function StatCard({ title, amount, icon, color, showSign = false }: StatCardProps) {
  // 图标容器：背景 + 文字色；金额：仅文字色（不加背景块）
  const iconClasses = {
    olive: 'bg-olive-50 text-olive',
    terra: 'bg-terra-50 text-terra',
    brown: 'bg-brown-50 text-brown',
  }

  const textClasses = {
    olive: 'text-olive',
    terra: 'text-terra',
    brown: 'text-brown',
  }
  
  return (
    <div className="bg-white rounded-lg border border-sand-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-charcoal-300">{title}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconClasses[color]}`}>
          {icon}
        </div>
      </div>
      <p className={`text-2xl font-semibold tabular-nums ${textClasses[color]}`}>
        {showSign && amount > 0 ? '+' : ''}{formatMoney(amount)}
      </p>
    </div>
  )
}
