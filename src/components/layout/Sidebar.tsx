import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ArrowLeftRight,
  Target,
  BarChart3,
  Settings,
  Repeat,
  Receipt,
  PanelLeftClose,
  PanelLeftOpen,
  Wallet,
  Plus,
  CalendarDays,
  TrendingUp,
  PiggyBank,
  LucideIcon,
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import TransactionForm from '../transactions/TransactionForm'

interface NavItem {
  path: string
  icon: LucideIcon
  label: string
}

const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: '总览',
    items: [
      { path: '/', icon: LayoutDashboard, label: '仪表盘' },
      { path: '/calendar', icon: CalendarDays, label: '日历' },
    ],
  },
  {
    title: '记录',
    items: [
      { path: '/transactions', icon: ArrowLeftRight, label: '记账' },
      { path: '/recurring-income', icon: Repeat, label: '固定收入' },
      { path: '/recurring-expense', icon: Receipt, label: '固定支出' },
    ],
  },
  {
    title: '规划',
    items: [
      { path: '/goals', icon: Target, label: '想买的东西' },
      { path: '/saving', icon: PiggyBank, label: '省钱' },
      { path: '/simulator', icon: TrendingUp, label: '财务模拟' },
      { path: '/reports', icon: BarChart3, label: '统计报表' },
    ],
  },
  {
    title: '通用',
    items: [
      { path: '/settings', icon: Settings, label: '设置' },
    ],
  },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()
  const categories = useAppStore(state => state.categories)
  const [showAdd, setShowAdd] = useState(false)

  return (
    <aside
      className={`hidden lg:flex sticky top-0 h-screen flex-shrink-0 self-start flex-col
        bg-cream border-r border-sand-200
        ${collapsed ? 'w-[72px]' : 'w-[220px]'}
        transition-[width] duration-200 ease-in-out`}
    >
      {/* Logo */}
      <div className={`h-16 flex items-center border-b border-sand-200 flex-shrink-0
        ${collapsed ? 'justify-center' : 'gap-2.5 px-4'}`}>
        <div className="w-8 h-8 rounded-lg bg-brown text-white flex items-center justify-center flex-shrink-0">
          <Wallet className="w-4 h-4" strokeWidth={1.5} />
        </div>
        {!collapsed && (
          <h1 className="text-lg font-display font-semibold tracking-wide text-charcoal truncate">
            财务规划助手
          </h1>
        )}
      </div>

      {/* 快捷记账 */}
      <div className={`pt-4 flex-shrink-0 ${collapsed ? 'px-0 flex justify-center' : 'px-4'}`}>
        <button
          onClick={() => setShowAdd(true)}
          title={collapsed ? '记一笔' : undefined}
          className={`bg-brown hover:bg-brown-500 active:scale-95 text-white rounded-lg
            flex items-center justify-center transition-all shadow-sm
            ${collapsed ? 'w-10 h-10 rounded-full' : 'w-full gap-1.5 py-2.5 text-sm font-medium'}`}
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          {!collapsed && <span>记一笔</span>}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 pt-2 pb-4">
        {navGroups.map((group, gi) => (
          <div key={group.title}>
            {collapsed ? (
              /* 折叠态：组间用细分隔线 */
              gi > 0 && <div className="mx-4 my-2 border-t border-sand-200" />
            ) : (
              /* 展开态：组标题 */
              <p className="px-5 pt-4 pb-1.5 text-xs font-medium tracking-widest text-charcoal-300">
                {group.title}
              </p>
            )}
            <ul className="px-2">
              {group.items.map((item) => {
                const isActive = location.pathname === item.path
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      className={`group relative flex items-center rounded-md
                        ${collapsed ? 'justify-center mx-0 py-2.5' : 'gap-3 mx-1 pl-4 pr-3 py-2'}
                        text-sm transition-colors duration-150 whitespace-nowrap
                        ${isActive
                          ? 'bg-sand-100 text-brown font-medium'
                          : 'text-charcoal-300 hover:bg-sand-100/70 hover:text-charcoal'
                        }`}
                    >
                      {/* 激活指示条 */}
                      {isActive && (
                        <span className={`absolute top-1/2 -translate-y-1/2 w-1 h-4 rounded-full bg-brown
                          ${collapsed ? 'left-0' : 'left-0'}`} />
                      )}
                      <item.icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.5} />
                      {!collapsed && <span className="truncate">{item.label}</span>}

                      {/* 折叠态悬停提示气泡 */}
                      {collapsed && (
                        <span className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50
                          whitespace-nowrap rounded-md bg-charcoal-500 px-2.5 py-1.5 text-xs text-white
                          opacity-0 translate-x-0 group-hover:opacity-100 transition-opacity duration-150 shadow-md">
                          {item.label}
                        </span>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer：折叠开关 + 状态 */}
      <div className="border-t border-sand-200 flex-shrink-0">
        <button
          onClick={onToggle}
          className={`w-full flex items-center text-charcoal-300 hover:bg-sand-100 hover:text-charcoal
            transition-colors text-sm ${collapsed ? 'justify-center py-3' : 'gap-3 px-5 py-3'}`}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />
          ) : (
            <>
              <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.5} />
              <span>收起侧边栏</span>
            </>
          )}
        </button>
        {!collapsed && (
          <p className="px-4 pb-3 text-[10px] text-charcoal-300 text-center">
            云端同步 · 多端可用
          </p>
        )}
      </div>

      {/* 快捷记账弹窗 */}
      <TransactionForm
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        categories={categories}
      />
    </aside>
  )
}
