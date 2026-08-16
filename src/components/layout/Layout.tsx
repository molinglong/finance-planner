import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import AiPanel from './AiPanel'
import BottomNav from './BottomNav'

const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed'

function readCollapsedFromStorage(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsedFromStorage)

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed))
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }, [collapsed])

  return (
    <div className="flex min-h-screen bg-cream">
      {/* 侧边栏在文档流内（sticky），宽度变化自动推动内容，杜绝 fixed+margin 错位；移动端隐藏改用底部导航 */}
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />
      <main className="flex-1 min-w-0 p-4 pb-28 lg:p-8 lg:pb-8">
        <Outlet />
      </main>
      {/* 右侧常驻 AI 面板（未配置 AI 时自隐藏，仅宽屏显示） */}
      <AiPanel />
      {/* 移动端底部导航（lg 及以上隐藏） */}
      <BottomNav />
    </div>
  )
}
