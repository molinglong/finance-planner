import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './features/dashboard/Dashboard'
import Calendar from './features/calendar/Calendar'
import Transactions from './features/transactions/Transactions'
import Goals from './features/goals/Goals'
import Saving from './features/saving/Saving'
import Simulator from './features/simulator/Simulator'
import Reports from './features/reports/Reports'
import Settings from './features/settings/Settings'
import RecurringIncome from './features/recurring-income/RecurringIncome'
import RecurringExpense from './features/recurring-expense/RecurringExpense'
import ToastContainer from './components/ui/Toast'
import Login from './features/auth/Login'
import Migrate from './features/auth/Migrate'
import { useAppStore } from './stores/appStore'
import { syncAppLockFromGoals } from './utils/appLock'

function App() {
  const checkAuth = useAppStore(state => state.checkAuth)
  const authStatus = useAppStore(state => state.authStatus)
  const needsMigration = useAppStore(state => state.needsMigration)
  const isLoading = useAppStore(state => state.isLoading)
  const isInitialized = useAppStore(state => state.isInitialized)
  const initialize = useAppStore(state => state.initialize)
  const goals = useAppStore(state => state.goals)

  // 启动时检查认证状态
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // 认证通过后加载数据
  useEffect(() => {
    if (authStatus === 'ready' && !isInitialized) {
      initialize()
    }
  }, [authStatus, isInitialized, initialize])

  // 令牌失效（任意请求返回 401）→ 统一登出
  useEffect(() => {
    const handler = () => useAppStore.getState().logout()
    window.addEventListener('fp:unauthorized', handler)
    return () => window.removeEventListener('fp:unauthorized', handler)
  }, [])

  // 冷静期联动应用锁：goals 变化/启动加载后同步到原生（仅原生 App 生效）
  useEffect(() => {
    if (!isInitialized) return
    syncAppLockFromGoals(goals)
  }, [goals, isInitialized])

  // 检查认证中
  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-charcoal-300 text-sm">加载中...</p>
      </div>
    )
  }

  // 未登录 / 首次设置
  if (authStatus === 'needSetup' || authStatus === 'login') {
    return (
      <>
        <ToastContainer />
        <Login />
      </>
    )
  }

  // 首次迁移引导
  if (needsMigration) {
    return (
      <>
        <ToastContainer />
        <Migrate />
      </>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-charcoal-300 text-sm">加载中...</p>
      </div>
    )
  }

  // 已就绪但未完成初始化 = 初始化失败（如后端未启动）
  if (!isInitialized) {
    return (
      <>
        <ToastContainer />
        <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-4 px-4">
          <p className="text-charcoal text-sm font-medium">数据加载失败，请确认后端服务已启动</p>
          <p className="text-charcoal-300 text-xs">启动命令：npm run server（或 npm run dev:all 同时启动前后端）</p>
          <button
            onClick={() => initialize()}
            className="mt-2 px-5 py-2.5 text-sm font-medium bg-brown text-white rounded-lg hover:bg-brown-500 transition-colors"
          >
            重新加载
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <ToastContainer />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="goals" element={<Goals />} />
          <Route path="saving" element={<Saving />} />
          <Route path="simulator" element={<Simulator />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="recurring-income" element={<RecurringIncome />} />
          <Route path="recurring-expense" element={<RecurringExpense />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  )
}

export default App
