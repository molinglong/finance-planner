import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  Plus,
  CalendarDays,
  Target,
  PiggyBank,
  TrendingUp,
  Repeat,
  Receipt,
  Settings,
  MoreHorizontal,
  X,
  LucideIcon,
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import TransactionForm from '../transactions/TransactionForm'

/**
 * 移动端底部导航（lg 及以上隐藏，由侧边栏接管）
 * 结构：首页 | 明细 | [中央记一笔] | 报表 | 更多
 */

interface NavEntry {
  path: string
  icon: LucideIcon
  label: string
}

const mainTabs: NavEntry[] = [
  { path: '/', icon: LayoutDashboard, label: '首页' },
  { path: '/transactions', icon: ArrowLeftRight, label: '明细' },
]

const rightTabs: NavEntry[] = [{ path: '/reports', icon: BarChart3, label: '报表' }]

const moreItems: NavEntry[] = [
  { path: '/calendar', icon: CalendarDays, label: '日历' },
  { path: '/goals', icon: Target, label: '想买的东西' },
  { path: '/saving', icon: PiggyBank, label: '省钱' },
  { path: '/simulator', icon: TrendingUp, label: '财务模拟' },
  { path: '/recurring-income', icon: Repeat, label: '固定收入' },
  { path: '/recurring-expense', icon: Receipt, label: '固定支出' },
  { path: '/settings', icon: Settings, label: '设置' },
]

export default function BottomNav() {
  const location = useLocation()
  const categories = useAppStore(state => state.categories)
  const [showAdd, setShowAdd] = useState(false)
  const [showMore, setShowMore] = useState(false)

  const moreActive = moreItems.some(i => i.path === location.pathname)

  const renderTab = (item: NavEntry) => {
    const isActive = location.pathname === item.path
    return (
      <NavLink
        key={item.path}
        to={item.path}
        className="flex flex-col items-center justify-center gap-0.5 py-2
          text-charcoal-300 active:text-brown transition-colors"
      >
        <item.icon
          className={`w-[22px] h-[22px] ${isActive ? 'text-brown' : ''}`}
          strokeWidth={isActive ? 2 : 1.5}
        />
        <span className={`text-[11px] leading-none ${isActive ? 'text-brown font-medium' : ''}`}>
          {item.label}
        </span>
      </NavLink>
    )
  }

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-cream/95 backdrop-blur border-t border-sand-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="grid grid-cols-5">
          {mainTabs.map(renderTab)}

          {/* 中央记一笔（凸起圆钮） */}
          <div className="flex justify-center items-start">
            <button
              onClick={() => setShowAdd(true)}
              aria-label="记一笔"
              className="-mt-5 w-12 h-12 rounded-full bg-brown hover:bg-brown-500 active:scale-95
                text-white flex items-center justify-center transition-all"
            >
              <Plus className="w-6 h-6" strokeWidth={2} />
            </button>
          </div>

          {rightTabs.map(renderTab)}

          {/* 更多 */}
          <button
            onClick={() => setShowMore(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-2
              text-charcoal-300 active:text-brown transition-colors"
          >
            <MoreHorizontal
              className={`w-[22px] h-[22px] ${moreActive ? 'text-brown' : ''}`}
              strokeWidth={moreActive ? 2 : 1.5}
            />
            <span className={`text-[11px] leading-none ${moreActive ? 'text-brown font-medium' : ''}`}>
              更多
            </span>
          </button>
        </div>
      </nav>

      {/* 更多面板：底部滑出 */}
      {showMore && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-charcoal/40 animate-fade-in" onClick={() => setShowMore(false)} />
          <div
            className="absolute bottom-0 inset-x-0 bg-cream rounded-t-2xl border-t border-sand-200 px-4 pt-4 animate-slide-up"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-charcoal">全部功能</p>
              <button
                onClick={() => setShowMore(false)}
                className="p-1.5 text-charcoal-300 hover:text-charcoal transition-colors"
                aria-label="关闭"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map(item => {
                const isActive = location.pathname === item.path
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setShowMore(false)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg py-3 transition-colors
                      ${
                        isActive
                          ? 'bg-sand-100 text-brown'
                          : 'text-charcoal-300 hover:bg-sand-100/70 hover:text-charcoal'
                      }`}
                  >
                    <item.icon className="w-5 h-5" strokeWidth={1.5} />
                    <span className="text-xs">{item.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 快捷记账弹窗 */}
      <TransactionForm
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        categories={categories}
      />
    </>
  )
}
