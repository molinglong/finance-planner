import { useEffect, useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { getCurrentMonth, formatMoney, yuanToCent, getMonthDisplayName } from '../../utils/format'
import { Edit2, Plus, Trash2, Repeat, Sparkles, AlertTriangle, Snowflake, Globe, Lock, Server } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { fetchAiConfig, putAiConfig, testAiConnection, fetchSearchConfig, putSearchConfig, testSearchConnection, type SearchProvider } from '../../api/ai'
import { api, setApiBase, API_BASE } from '../../api/client'
import { toast } from '../../components/ui/Toast'
import Icon, { ACCOUNT_ICON_OPTIONS, CATEGORY_ICON_OPTIONS } from '../../components/ui/Icon'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Select from '../../components/ui/Select'
import { Link } from 'react-router-dom'
import { TransactionType } from '../../types'
import { appLockAvailable, getAppLockState, openAccessibilitySettings, requestShizukuPermission, type LockState } from '../../utils/appLock'
import { format } from 'date-fns'
import { SOFT_PALETTE, DUSTY_PALETTE, readableTextColor } from '../../utils/colors'

export default function Settings() {
  const categories = useAppStore(state => state.categories)
  const budgets = useAppStore(state => state.budgets)
  const accounts = useAppStore(state => state.accounts)
  const setBudget = useAppStore(state => state.setBudget)
  const addCategory = useAppStore(state => state.addCategory)
  const updateCategory = useAppStore(state => state.updateCategory)
  const deleteCategory = useAppStore(state => state.deleteCategory)
  const logout = useAppStore(state => state.logout)
  const setAccountFrozen = useAppStore(state => state.setAccountFrozen)
  
  const currentMonth = getCurrentMonth()
  const currentBudget = budgets.find(b => b.month === currentMonth)
  
  const [showBudgetModal, setShowBudgetModal] = useState(false)
  const [totalBudget, setTotalBudget] = useState(currentBudget?.totalBudget ? (currentBudget.totalBudget / 100).toString() : '')
  const [categoryBudgetValues, setCategoryBudgetValues] = useState<Record<string, string>>({})
  
  // Account modals
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [showCustomAccountModal, setShowCustomAccountModal] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<string>('')
  const [adjustAmount, setAdjustAmount] = useState('')

  // 冻结账户（如“老婆本”）
  const [showFreezeModal, setShowFreezeModal] = useState(false)
  const [freezeNote, setFreezeNote] = useState('')
  
  // Custom account form
  const [customAccountName, setCustomAccountName] = useState('')
  const [customAccountIcon, setCustomAccountIcon] = useState('briefcase')
  const [customAccountColor, setCustomAccountColor] = useState('#BBA28F')
  
  // 固定账户名称（不可改名/删除）
  const FIXED_ACCOUNT_NAMES = ['微信', '支付宝']

  // 冷静期应用锁（原生 App 专属，Web 端 hidden）
  const [lockState, setLockState] = useState<LockState | null>(null)

  // 服务器地址配置（原生 App 专属）
  const isNative = Capacitor.isNativePlatform()
  const [serverUrl, setServerUrl] = useState(API_BASE || '')
  const [showServerUrlInput, setShowServerUrlInput] = useState(false)

  const handleSaveServerUrl = () => {
    const url = serverUrl.trim().replace(/\/+$/, '')
    if (!url) return
    setApiBase(url)
    toast('服务器地址已保存，正在重新加载…', 'success')
    setTimeout(() => window.location.reload(), 800)
  }

  useEffect(() => {
    if (!appLockAvailable()) return
    const refresh = () => {
      getAppLockState().then(setLockState)
    }
    refresh()
    // 从系统设置/ Shizuku 页返回后自动刷新状态
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  
  // 新手引导开关（与仪表盘共用同一个 localStorage key）
  const GUIDE_STORAGE_KEY = 'welcome-guide-dismissed'
  const [showGuide, setShowGuide] = useState<boolean>(() => {
    try {
      return localStorage.getItem(GUIDE_STORAGE_KEY) !== 'true'
    } catch {
      return true
    }
  })
  
  const handleToggleGuide = (next: boolean) => {
    setShowGuide(next)
    try {
      localStorage.setItem(GUIDE_STORAGE_KEY, next ? 'false' : 'true')
    } catch {
      /* ignore */
    }
  }
  
  // 自定义账户（第 3 个）
  const customAccount = accounts.find(a => !FIXED_ACCOUNT_NAMES.includes(a.name))
  
  const expenseCategories = categories.filter(c => c.type === 'expense')
  
  const openBudgetModal = () => {
    setTotalBudget(currentBudget?.totalBudget ? (currentBudget.totalBudget / 100).toString() : '')
    const map: Record<string, string> = {}
    for (const cb of currentBudget?.categoryBudgets || []) {
      map[cb.categoryId] = (cb.amount / 100).toString()
    }
    setCategoryBudgetValues(map)
    setShowBudgetModal(true)
  }
  
  const handleSaveBudget = async () => {
    if (!totalBudget) return
    
    const categoryBudgets = Object.entries(categoryBudgetValues)
      .filter(([, value]) => value !== '' && parseFloat(value) > 0)
      .map(([categoryId, value]) => ({
        categoryId,
        amount: yuanToCent(parseFloat(value)),
      }))
    
    await setBudget({
      month: currentMonth,
      totalBudget: yuanToCent(parseFloat(totalBudget)),
      categoryBudgets,
    })
    
    setShowBudgetModal(false)
  }
  
  // 动态计算账户余额
  const getAccountBalance = (accountId: string) => {
    const transactions = useAppStore.getState().transactions
    const acc = accounts.find(a => a.id === accountId)
    if (!acc) return 0
    
    const accTxs = transactions.filter(t => t.accountId === accountId)
    const income = accTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
    const expense = accTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
    
    return acc.initialBalance + income - expense
  }
  
  const handleFreezeAccount = async () => {
    if (!selectedAccount) return
    await setAccountFrozen(selectedAccount, true, freezeNote)
    setShowFreezeModal(false)
    setFreezeNote('')
  }

  const handleUnfreezeAccount = async (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId)
    if (!acc) return
    const label = acc.frozenNote || '冻结的钱'
    if (!window.confirm(`确定解冻「${acc.name}」吗？${label}将重新可支出、可划出。`)) return
    await setAccountFrozen(accountId, false)
  }

  const handleAdjustBalance = async () => {
    if (!selectedAccount || !adjustAmount) return
    
    // 余额 = 初始余额 + 收入 − 支出：校准应把初始余额加上「实际余额 − 当前显示余额」的差额，
    // 而不是直接用输入值覆盖（否则显示余额 = 输入值 + 收入 − 支出，与用户输入不符）
    const acc = accounts.find(a => a.id === selectedAccount)
    if (!acc) return
    const diff = yuanToCent(parseFloat(adjustAmount)) - getAccountBalance(selectedAccount)
    await useAppStore.getState().updateAccount(selectedAccount, {
      initialBalance: acc.initialBalance + diff,
    })
    
    setShowAdjustModal(false)
    setAdjustAmount('')
  }
  
  const openCustomAccountModal = () => {
    if (!customAccount) return
    setCustomAccountName(customAccount.name)
    setCustomAccountIcon(customAccount.icon)
    setCustomAccountColor(customAccount.color)
    setShowCustomAccountModal(true)
  }
  
  const handleSaveCustomAccount = async () => {
    if (!customAccount || !customAccountName.trim()) return
    
    // 不能改名为固定账户名：下次登录 bootstrap 会把重名账户强制合并，导致数据重定向、账户被删
    const name = customAccountName.trim()
    if (name === '微信' || name === '支付宝') {
      toast('不能命名为「微信」或「支付宝」，会与固定账户重名冲突', 'error')
      return
    }
    
    await useAppStore.getState().updateAccount(customAccount.id, {
      name,
      icon: customAccountIcon,
      color: customAccountColor,
    })
    
    setShowCustomAccountModal(false)
  }
  
  // ============ AI 助手配置 ============
  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiHasKey, setAiHasKey] = useState(false)
  const [aiSaving, setAiSaving] = useState(false)
  const [aiTesting, setAiTesting] = useState(false)
  const [aiMsg, setAiMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    fetchAiConfig()
      .then(cfg => {
        setAiBaseUrl(cfg.baseUrl || '')
        setAiModel(cfg.model || '')
        setAiHasKey(cfg.configured)
      })
      .catch(() => { /* 忽略：后端未启动时保持空 */ })
  }, [])

  const handleSaveAi = async (thenTest = false) => {
    if (!aiBaseUrl.trim() || !aiModel.trim()) {
      setAiMsg({ type: 'err', text: '请填写接口地址与模型名' })
      return
    }
    thenTest ? setAiTesting(true) : setAiSaving(true)
    setAiMsg(null)
    try {
      await putAiConfig({
        baseUrl: aiBaseUrl.trim(),
        model: aiModel.trim(),
        apiKey: aiApiKey || undefined,
      })
      setAiApiKey('')
      if (thenTest) {
        const r = await testAiConnection()
        setAiMsg({ type: 'ok', text: `连接成功，模型回复：${r.reply}` })
      } else {
        setAiMsg({ type: 'ok', text: '已保存' })
      }
      const cfg = await fetchAiConfig()
      setAiHasKey(cfg.configured)
    } catch (err) {
      setAiMsg({ type: 'err', text: err instanceof Error ? err.message : '操作失败' })
    } finally {
      setAiSaving(false)
      setAiTesting(false)
    }
  }

  const handleClearAiKey = async () => {
    if (!confirm('确定清除已保存的密钥吗？清除后 AI 功能将停用。')) return
    try {
      await putAiConfig({ baseUrl: aiBaseUrl.trim() || 'https://localhost', model: aiModel.trim() || 'none', clearApiKey: true })
      setAiHasKey(false)
      setAiMsg({ type: 'ok', text: '密钥已清除' })
    } catch (err) {
      setAiMsg({ type: 'err', text: err instanceof Error ? err.message : '操作失败' })
    }
  }

  // ============ 联网搜索配置 ============
  const [searchProvider, setSearchProvider] = useState<SearchProvider>('bocha')
  const [searchApiKey, setSearchApiKey] = useState('')
  const [searchHasKey, setSearchHasKey] = useState(false)
  const [searchSaving, setSearchSaving] = useState(false)
  const [searchTesting, setSearchTesting] = useState(false)
  const [searchMsg, setSearchMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    fetchSearchConfig()
      .then(cfg => {
        if (cfg.configured && cfg.provider) {
          setSearchProvider(cfg.provider)
          setSearchHasKey(true)
        }
      })
      .catch(() => { /* 忽略：后端未启动时保持默认 */ })
  }, [])

  const handleSaveSearch = async (thenTest = false) => {
    if (!searchApiKey.trim() && !searchHasKey) {
      setSearchMsg({ type: 'err', text: '请填写搜索 API 密钥' })
      return
    }
    thenTest ? setSearchTesting(true) : setSearchSaving(true)
    setSearchMsg(null)
    try {
      await putSearchConfig({
        provider: searchProvider,
        apiKey: searchApiKey || undefined,
      })
      setSearchApiKey('')
      if (thenTest) {
        const r = await testSearchConnection()
        setSearchMsg({ type: 'ok', text: `搜索成功（${r.searchTime}）：${r.firstSite}「${r.first}」等 ${r.count} 条结果` })
      } else {
        setSearchMsg({ type: 'ok', text: '已保存' })
      }
      setSearchHasKey(true)
    } catch (err) {
      setSearchMsg({ type: 'err', text: err instanceof Error ? err.message : '操作失败' })
    } finally {
      setSearchSaving(false)
      setSearchTesting(false)
    }
  }

  const handleClearSearchKey = async () => {
    if (!confirm('确定清除搜索密钥吗？清除后 AI 将不再联网查询。')) return
    try {
      await putSearchConfig({ provider: searchProvider, clearApiKey: true })
      setSearchHasKey(false)
      setSearchMsg({ type: 'ok', text: '搜索密钥已清除' })
    } catch (err) {
      setSearchMsg({ type: 'err', text: err instanceof Error ? err.message : '操作失败' })
    }
  }

  // ============ 清除所有数据（二次确认） ============
  const [showClearModal1, setShowClearModal1] = useState(false)
  const [showClearModal2, setShowClearModal2] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [clearing, setClearing] = useState(false)

  const handleClearAllData = async () => {
    setClearing(true)
    try {
      await api('/clear-data', { method: 'POST' })
      setShowClearModal2(false)
      toast('数据已全部清除，即将刷新页面…', 'success')
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      toast(err instanceof Error ? err.message : '清除失败，请重试', 'error')
      setClearing(false)
    }
  }

  // 本月支出
  const transactions = useAppStore(state => state.transactions)
  const monthlyExpense = useAppStore(state => {
    const transactions = state.transactions
    return transactions
      .filter(t => t.type === 'expense' && t.date.startsWith(currentMonth))
      .reduce((sum, t) => sum + t.amount, 0)
  })
  
  const budgetAmount = currentBudget?.totalBudget || 0
  const remaining = budgetAmount - monthlyExpense
  const percentage = budgetAmount > 0 ? Math.round((monthlyExpense / budgetAmount) * 100) : 0
  
  // 统一双档色板：浅粉彩（小元素）+ 蒙灰中调（图表填充）
  const colorOptions = [...SOFT_PALETTE, ...DUSTY_PALETTE]
  
  // Category management state
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryType, setCategoryType] = useState<TransactionType>('expense')
  const [categoryColor, setCategoryColor] = useState('#8A8580')
  const [categoryIcon, setCategoryIcon] = useState('tag')
  
  const categoryColorOptions = [...SOFT_PALETTE, ...DUSTY_PALETTE, '#8A8580']
  
  const openAddCategory = (type: TransactionType) => {
    setEditingCategoryId(null)
    setCategoryName('')
    setCategoryType(type)
    setCategoryColor('#8A8580')
    setCategoryIcon('tag')
    setShowCategoryModal(true)
  }
  
  const openEditCategory = (id: string) => {
    const cat = categories.find(c => c.id === id)
    if (!cat) return
    setEditingCategoryId(id)
    setCategoryName(cat.name)
    setCategoryType(cat.type)
    setCategoryColor(cat.color)
    setCategoryIcon(cat.icon)
    setShowCategoryModal(true)
  }
  
  const handleSaveCategory = async () => {
    if (!categoryName.trim()) return
    
    if (editingCategoryId) {
      await updateCategory(editingCategoryId, {
        name: categoryName.trim(),
        icon: categoryIcon,
        color: categoryColor,
      })
    } else {
      await addCategory({
        name: categoryName.trim(),
        type: categoryType,
        icon: categoryIcon,
        color: categoryColor,
        isPreset: false,
        sortOrder: categories.filter(c => c.type === categoryType).length + 1,
      })
    }
    
    setShowCategoryModal(false)
    setEditingCategoryId(null)
    setCategoryName('')
  }
  
  const handleDeleteCategory = async (id: string) => {
    const cat = categories.find(c => c.id === id)
    if (!cat) return
    if (cat.name === '未分类') return // 未分类不可删
    if (!confirm(`确定删除分类"${cat.name}"吗？已有记录不受影响。`)) return
    await deleteCategory(id)
  }
  
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold text-charcoal">
          设置
        </h1>
        <p className="text-sm text-charcoal-300 mt-1">
          管理预算、账户与分类
        </p>
      </div>
      
      {/* Accounts Section */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-charcoal">
              账户管理
            </h3>
            <p className="text-xs text-charcoal-300 mt-0.5">
              微信、支付宝为固定账户，第 3 个可自定义
            </p>
          </div>
        </div>
        
        <div className="space-y-3">
          {accounts.map((account) => {
            const isFixed = FIXED_ACCOUNT_NAMES.includes(account.name)
            return (
              <div key={account.id} className={`flex items-center justify-between p-4 rounded-lg border ${
                account.isFrozen ? 'bg-[#EFF3FA] border-[#DCE5F2]' : 'bg-sand-50 border-sand-100'
              }`}>
                <div className="flex items-center gap-3">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm"
                    style={{ backgroundColor: account.color, color: readableTextColor(account.color) }}
                  >
                    <Icon name={account.icon} className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-charcoal">{account.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        isFixed ? 'bg-sand-200 text-charcoal-300' : 'bg-brown-50 text-brown'
                      }`}>
                        {isFixed ? '固定' : '自定义'}
                      </span>
                      {account.isFrozen && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-[#E3EBF7] text-[#5F739E]">
                          已冻结{account.frozenNote ? ` · ${account.frozenNote}` : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-charcoal-300 mt-0.5">
                      {account.isFrozen
                        ? '这笔钱不能支出、不能划出，也不计入可用余额'
                        : isFixed ? '不可改名或删除' : '可自定义名称、图标和颜色'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <p className="text-xl font-semibold text-charcoal tabular-nums">
                    {formatMoney(getAccountBalance(account.id))}
                  </p>
                  <div className="flex gap-1">
                    {!isFixed && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        title="编辑"
                        onClick={openCustomAccountModal}
                      >
                        <Edit2 className="w-4 h-4 text-brown" />
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm"
                        title={account.isFrozen ? '解冻' : '冻结（如老婆本，不能动）'}
                        onClick={() => {
                          if (account.isFrozen) {
                            handleUnfreezeAccount(account.id)
                          } else {
                            setSelectedAccount(account.id)
                            setFreezeNote(account.frozenNote || '')
                            setShowFreezeModal(true)
                          }
                        }}
                      >
                        <Snowflake 
                          className={`w-4 h-4 ${account.isFrozen ? 'text-[#7C90BC]' : 'text-charcoal-300 hover:text-[#7C90BC]'}`} 
                        />
                      </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      title="校准余额"
                      onClick={() => {
                        setSelectedAccount(account.id)
                        setAdjustAmount((getAccountBalance(account.id) / 100).toString())
                        setShowAdjustModal(true)
                      }}
                    >
                      <Edit2 className="w-4 h-4 text-olive" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
      
      {/* Recurring Items Section */}
      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Repeat className="w-5 h-5 text-brown" />
          <h3 className="text-lg font-medium text-charcoal">
            周期性收支
          </h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-sand-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-charcoal">周期性收入</p>
              <p className="text-xs text-charcoal-300">工资、生活费等，到期自动入账</p>
            </div>
            <Link to="/recurring-income">
              <Button variant="ghost" size="sm">
                管理
              </Button>
            </Link>
          </div>
          <div className="flex items-center justify-between p-3 bg-sand-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-charcoal">周期性支出</p>
              <p className="text-xs text-charcoal-300">订阅、房租、水电等，到期自动记账扣款</p>
            </div>
            <Link to="/recurring-expense">
              <Button variant="ghost" size="sm">
                管理
              </Button>
            </Link>
          </div>
        </div>
      </Card>
      
      {/* 冷静期应用锁（原生 App 专属） */}
      {appLockAvailable() && (
        <Card className="p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-5 h-5 text-brown" />
            <h3 className="text-lg font-medium text-charcoal">冷静期应用锁</h3>
          </div>
          <div className="space-y-3">
            {/* Shizuku 精确锁定链路 */}
            <div className={`p-3 rounded-lg ${
              lockState?.shizukuAlive && lockState?.shizukuGranted
                ? 'bg-sand-50'
                : 'bg-terra-50'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-charcoal">精确锁定（推荐）</p>
                  <p className="text-xs text-charcoal-300">
                    {!lockState?.shizukuAlive
                      ? 'Shizuku 未激活：冷静期内将通过无障碍锁定QQ'
                      : !lockState?.shizukuGranted
                        ? 'Shizuku 已激活，待授权本应用'
                        : lockState.cloneSuspended
                          ? 'QQ已挂起，微信不受影响'
                          : '就绪：冷静期开始时自动挂起QQ'}
                  </p>
                </div>
                {lockState?.shizukuAlive && !lockState.shizukuGranted && (
                  <Button variant="primary" size="sm" onClick={requestShizukuPermission}>
                    授权
                  </Button>
                )}
              </div>
              {!lockState?.shizukuAlive && (
                <div className="mt-3 pt-3 border-t border-sand-200 space-y-2">
                  <p className="text-xs text-charcoal-300">激活步骤：安装 Shizuku → 手机上通过无线调试启动 → 重启手机后需重新激活（约 1 分钟）</p>
                  <a
                    href="https://shizuku.rikka.app/download/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brown underline underline-offset-2"
                  >
                    下载 Shizuku（免费开源）
                  </a>
                </div>
              )}
            </div>

            {/* 无障碍兑底链路 */}
            <div className={`flex items-center justify-between p-3 rounded-lg ${
              lockState?.serviceEnabled ? 'bg-sand-50' : 'bg-terra-50'
            }`}>
              <div>
                <p className="text-sm font-medium text-charcoal">兑底锁定（Shizuku 离线时生效）</p>
                <p className="text-xs text-charcoal-300">
                  {lockState?.serviceEnabled
                    ? '无障碍服务已启用，Shizuku 离线时自动锁QQ'
                    : '未启用：Shizuku 离线时冷静期将无法拦截'}
                </p>
              </div>
              {!lockState?.serviceEnabled && (
                <Button variant="primary" size="sm" onClick={openAccessibilitySettings}>
                  去开启
                </Button>
              )}
            </div>

            {/* 当前锁定状态 */}
            <div className="flex items-center justify-between p-3 bg-sand-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-charcoal">当前锁定状态</p>
                <p className="text-xs text-charcoal-300">
                  {lockState?.active
                    ? `${lockState.labels || '冷静期进行中'} · 至 ${format(new Date(lockState.endsAt), 'MM-dd HH:mm')}${lockState.scope === 'all' ? ' · 无障碍锁QQ' : ' · QQ已挂起'}`
                    : '未锁定（没有冷静期中的目标）'}
                </p>
              </div>
            </div>

            <p className="text-xs text-charcoal-300 px-1">
              设置冷静期后自动锁定：优先精确挂起QQ（图标保留、无法打开，微信不受影响）；
              Shizuku 离线时兑底锁定QQ，防止故意断开绕过。冷静期结束自动恢复。
            </p>
          </div>
        </Card>
      )}
      
      {/* Budget Section */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-charcoal">
            {getMonthDisplayName(currentMonth)}预算
          </h3>
          <Button variant="ghost" size="sm" onClick={openBudgetModal}>
            <Edit2 className="w-4 h-4 mr-1" />
            编辑
          </Button>
        </div>
        
        {budgetAmount > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-sm text-charcoal-300 mb-1">预算</p>
                <p className="text-xl font-semibold text-charcoal tabular-nums">
                  {formatMoney(budgetAmount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-charcoal-300 mb-1">已用</p>
                <p className="text-xl font-semibold text-terra tabular-nums">
                  {formatMoney(monthlyExpense)}
                </p>
              </div>
              <div>
                <p className="text-sm text-charcoal-300 mb-1">剩余</p>
                <p className={`text-xl font-semibold tabular-nums ${
                  remaining >= 0 ? 'text-olive' : 'text-terra'
                }`}>
                  {formatMoney(remaining)}
                </p>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="h-3 bg-sand-100 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  percentage > 100 ? 'bg-terra' : percentage > 80 ? 'bg-brown-300' : 'bg-olive'
                }`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
            <p className="text-sm text-charcoal-300 mt-2">
              已使用 {percentage}%
            </p>
            
            {/* 分类预算 */}
            {currentBudget && currentBudget.categoryBudgets.length > 0 && (
              <div className="mt-4 pt-4 border-t border-sand-100 space-y-3">
                <p className="text-sm font-medium text-charcoal-400">分类预算</p>
                {currentBudget.categoryBudgets.map(cb => {
                  const cat = categories.find(c => c.id === cb.categoryId)
                  if (!cat || cb.amount <= 0) return null
                  const spend = transactions
                    .filter(t => t.type === 'expense' && t.date.startsWith(currentMonth) && t.categoryId === cb.categoryId)
                    .reduce((sum, t) => sum + t.amount, 0)
                  const catPercentage = Math.round((spend / cb.amount) * 100)
                  return (
                    <div key={cb.categoryId}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-sm text-charcoal">{cat.name}</span>
                        </div>
                        <span className="text-xs text-charcoal-300 tabular-nums">
                          {formatMoney(spend)} / {formatMoney(cb.amount)}
                        </span>
                      </div>
                      <div className="h-2 bg-sand-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            catPercentage > 100 ? 'bg-terra' : catPercentage > 80 ? 'bg-brown-300' : 'bg-olive'
                          }`}
                          style={{ width: `${Math.min(catPercentage, 100)}%` }}
                        />
                      </div>
                      {catPercentage >= 100 && (
                        <p className="text-xs text-terra mt-1">已超支！</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <div className="py-8 text-center">
            <p className="text-charcoal-300 mb-4">本月尚未设置预算</p>
            <Button onClick={openBudgetModal}>设置预算</Button>
          </div>
        )}
      </Card>
      
      {/* Categories Section */}
      <Card className="p-5">
        <div className="space-y-6">
          {/* Expense Categories */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-charcoal-400">支出分类</h4>
              <Button variant="ghost" size="sm" onClick={() => openAddCategory('expense')}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                添加
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {categories.filter(c => c.type === 'expense').map((category) => (
                <div 
                  key={category.id}
                  className="flex items-center gap-2 p-3 bg-sand-50 rounded-lg border border-sand-100 group"
                >
                  <span 
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="text-sm text-charcoal flex-1 truncate">{category.name}</span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-1 hover:bg-sand-200 rounded"
                      onClick={() => openEditCategory(category.id)}
                      title="编辑"
                    >
                      <Edit2 className="w-3 h-3 text-charcoal-300" />
                    </button>
                    {category.name === '未分类' ? (
                      <span className="p-1" title="默认分类，不可删除">
                        <svg className="w-3 h-3 text-charcoal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      </span>
                    ) : (
                      <button
                        className="p-1 hover:bg-red-50 rounded"
                        onClick={() => handleDeleteCategory(category.id)}
                        title="删除"
                      >
                        <Trash2 className="w-3 h-3 text-terra" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Income Categories */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-charcoal-400">收入分类</h4>
              <Button variant="ghost" size="sm" onClick={() => openAddCategory('income')}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                添加
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {categories.filter(c => c.type === 'income').map((category) => (
                <div 
                  key={category.id}
                  className="flex items-center gap-2 p-3 bg-sand-50 rounded-lg border border-sand-100 group"
                >
                  <span 
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="text-sm text-charcoal flex-1 truncate">{category.name}</span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-1 hover:bg-sand-200 rounded"
                      onClick={() => openEditCategory(category.id)}
                      title="编辑"
                    >
                      <Edit2 className="w-3 h-3 text-charcoal-300" />
                    </button>
                    {category.name === '未分类' ? (
                      <span className="p-1" title="默认分类，不可删除">
                        <svg className="w-3 h-3 text-charcoal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      </span>
                    ) : (
                      <button
                        className="p-1 hover:bg-red-50 rounded"
                        onClick={() => handleDeleteCategory(category.id)}
                        title="删除"
                      >
                        <Trash2 className="w-3 h-3 text-terra" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
      
      {/* 通用设置 */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-charcoal">
              通用
            </h3>
            <div className="flex items-center gap-3 mt-3">
              <div>
                <p className="text-sm text-charcoal">仪表盘新手引导</p>
                <p className="text-xs text-charcoal-300 mt-0.5">
                  仅在还没有记账时显示的欢迎提示卡片
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => handleToggleGuide(!showGuide)}
            title={showGuide ? '点击关闭' : '点击开启'}
            className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0
              ${showGuide ? 'bg-olive' : 'bg-sand-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow
              transition-transform duration-200 ${showGuide ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>

        {isNative && (
          <div className="mt-4 pt-4 border-t border-sand-100">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm text-charcoal flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-charcoal-300" />
                  服务器地址
                </p>
                <p className="text-xs text-charcoal-300 mt-0.5 font-mono">{API_BASE}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowServerUrlInput(!showServerUrlInput)}>
                修改
              </Button>
            </div>
            {showServerUrlInput && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  placeholder="http://192.168.x.x:3001"
                  value={serverUrl}
                  onChange={e => setServerUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveServerUrl() } }}
                  className="flex-1 px-3 py-2 text-sm bg-sand-50 border border-sand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown"
                />
                <Button size="sm" onClick={handleSaveServerUrl}>保存</Button>
              </div>
            )}
          </div>
        )}
      </Card>
      
      {/* AI 助手 */}
      <Card className="p-5 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-charcoal flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brown" />
              AI 助手
            </h3>
            <p className="text-xs text-charcoal-300 mt-1">
              配置 OpenAI 兼容接口（DeepSeek / 通义 / GLM / OpenAI 等），在购买分析中提供 AI 建议。密钥仅存本机数据库，不会上传。
            </p>
          </div>
          {aiHasKey && (
            <span className="text-xs text-olive bg-olive-50 px-2 py-1 rounded-md shrink-0">已启用</span>
          )}
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-charcoal-400 mb-1">接口地址</label>
              <input
                type="text"
                placeholder="如 https://api.deepseek.com/v1"
                value={aiBaseUrl}
                onChange={(e) => setAiBaseUrl(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal-400 mb-1">模型名</label>
              <input
                type="text"
                placeholder="如 deepseek-chat"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-charcoal-400">API 密钥</label>
              {aiHasKey && (
                <button
                  className="text-xs text-terra hover:underline"
                  onClick={handleClearAiKey}
                >
                  清除已存密钥
                </button>
              )}
            </div>
            <input
              type="password"
              placeholder={aiHasKey ? '已保存（留空保持不变）' : 'sk-...'}
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => handleSaveAi(false)} disabled={aiSaving || aiTesting}>
              {aiSaving ? '保存中…' : '保存'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleSaveAi(true)} disabled={aiSaving || aiTesting}>
              {aiTesting ? '测试中…' : '保存并测试连接'}
            </Button>
            {aiMsg && (
              <span className={`text-xs ${aiMsg.type === 'ok' ? 'text-olive' : 'text-terra'} truncate`} title={aiMsg.text}>
                {aiMsg.text}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* 联网搜索 */}
      <Card className="p-5 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-charcoal flex items-center gap-2">
              <Globe className="w-4 h-4 text-brown" />
              联网搜索
            </h3>
            <p className="text-xs text-charcoal-300 mt-1">
              问 AI「某某多少钱」时先联网搜实时价格，报价会附搜索时间与来源，仅供参考。密钥仅存本机数据库。
            </p>
          </div>
          {searchHasKey && (
            <span className="text-xs text-olive bg-olive-50 px-2 py-1 rounded-md shrink-0">已启用</span>
          )}
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-charcoal-400 mb-1">搜索服务商</label>
              <select
                value={searchProvider}
                onChange={(e) => setSearchProvider(e.target.value as SearchProvider)}
                className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown"
              >
                <option value="bocha">博查 Bocha（国内直连）</option>
                <option value="tavily">Tavily（国际）</option>
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-charcoal-400">搜索 API 密钥</label>
                {searchHasKey && (
                  <button
                    className="text-xs text-terra hover:underline"
                    onClick={handleClearSearchKey}
                  >
                    清除已存密钥
                  </button>
                )}
              </div>
              <input
                type="password"
                placeholder={searchHasKey ? '已保存（留空保持不变）' : 'sk-...'}
                value={searchApiKey}
                onChange={(e) => setSearchApiKey(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => handleSaveSearch(false)} disabled={searchSaving || searchTesting}>
              {searchSaving ? '保存中…' : '保存'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleSaveSearch(true)} disabled={searchSaving || searchTesting}>
              {searchTesting ? '搜索中…' : '保存并测试搜索'}
            </Button>
            {searchMsg && (
              <span className={`text-xs ${searchMsg.type === 'ok' ? 'text-olive' : 'text-terra'} truncate max-w-[300px]`} title={searchMsg.text}>
                {searchMsg.text}
              </span>
            )}
          </div>
          <p className="text-xs text-charcoal-300">
            {searchProvider === 'bocha'
              ? '博查：open.bochaai.com 注册获取 API Key，国内直连无需代理'
              : 'Tavily：app.tavily.com 注册获取 API Key（每月有免费额度），需可访问国际网络'}
          </p>
        </div>
      </Card>

      {/* Account / Logout Section */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-charcoal">云端数据</p>
            <p className="text-xs text-charcoal-300 mt-0.5">
              数据存储于本机服务端数据库（server/data），多设备可用同一密码访问
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={logout}>
            退出登录
          </Button>
        </div>
      </Card>

      {/* Danger Zone */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-terra">清除所有数据</p>
            <p className="text-xs text-charcoal-300 mt-0.5">
              删除全部交易、预算、想买的东西与周期性收支，账户与分类重置为预设；密码与 AI 配置保留，不可恢复
            </p>
          </div>
          <Button variant="danger" size="sm" onClick={() => setShowClearModal1(true)}>
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            清除所有数据
          </Button>
        </div>
      </Card>

      {/* Budget Modal */}
      <Modal
        isOpen={showBudgetModal}
        onClose={() => setShowBudgetModal(false)}
        title="设置月度预算"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowBudgetModal(false)}>取消</Button>
            <Button onClick={handleSaveBudget} disabled={!totalBudget}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="月度预算金额"
            type="number"
            placeholder="0.00"
            value={totalBudget}
            onChange={(e) => setTotalBudget(e.target.value)}
            step="0.01"
            min="0"
          />
          <p className="text-sm text-charcoal-300">
            设置每月支出预算上限，超支时会显示警告
          </p>
          
          <div className="space-y-2">
            <div>
              <label className="block text-sm font-medium text-charcoal-400">分类预算（可选）</label>
              <p className="text-xs text-charcoal-300 mt-0.5">
                为各支出分类单独设置预算上限，留空表示不限制
              </p>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {expenseCategories.map(cat => (
                <div key={cat.id} className="flex items-center gap-2">
                  <span 
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-sm text-charcoal w-20 flex-shrink-0 truncate">{cat.name}</span>
                  <input
                    type="number"
                    placeholder="不限"
                    value={categoryBudgetValues[cat.id] || ''}
                    onChange={(e) => setCategoryBudgetValues(prev => ({
                      ...prev,
                      [cat.id]: e.target.value,
                    }))}
                    step="0.01"
                    min="0"
                    className="flex-1 px-3 py-1.5 text-sm bg-white border border-sand-200 rounded-lg
                      focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
      
      {/* Adjust Balance Modal */}
      <Modal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        title="校准账户余额"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdjustModal(false)}>取消</Button>
            <Button onClick={handleAdjustBalance} disabled={!adjustAmount}>
              保存余额
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-sand-100 rounded-lg p-4 text-center">
            <p className="text-sm text-charcoal-300 mb-1">当前余额</p>
            <p className="text-2xl font-semibold text-charcoal tabular-nums">
              {formatMoney(getAccountBalance(selectedAccount))}
            </p>
          </div>
          
          <Input
            label="实际余额"
            type="number"
            placeholder="0.00"
            value={adjustAmount}
            onChange={(e) => setAdjustAmount(e.target.value)}
            step="0.01"
            min="0"
          />
          
          <p className="text-xs text-charcoal-300">
            如果你的微信/支付宝实际余额与系统计算的不一致，在这里输入实际余额进行校准。
          </p>
        </div>
      </Modal>
      
      {/* Custom Account Modal */}
      <Modal
        isOpen={showCustomAccountModal}
        onClose={() => setShowCustomAccountModal(false)}
        title="自定义第 3 个账户"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCustomAccountModal(false)}>取消</Button>
            <Button onClick={handleSaveCustomAccount} disabled={!customAccountName.trim()}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="账户名称"
            placeholder="例如：银行卡、现金、储蓄卡..."
            value={customAccountName}
            onChange={(e) => setCustomAccountName(e.target.value)}
          />
          
          <div className="space-y-1">
            <label className="block text-sm font-medium text-charcoal-400">图标</label>
            <div className="flex gap-2 flex-wrap">
              {ACCOUNT_ICON_OPTIONS.map((icon) => (
                <button
                  key={icon}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center
                    ${customAccountIcon === icon ? 'bg-brown text-white' : 'bg-sand-100 hover:bg-sand-200'}`}
                  onClick={() => setCustomAccountIcon(icon)}
                >
                  <Icon name={icon} className="w-5 h-5" />
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-1">
            <label className="block text-sm font-medium text-charcoal-400">颜色</label>
            <div className="flex gap-2">
              {colorOptions.map((color) => (
                <button
                  key={color}
                  className={`w-8 h-8 rounded-full border-2 ${
                    customAccountColor === color ? 'border-charcoal' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setCustomAccountColor(color)}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Freeze Account Modal */}
      <Modal
        isOpen={showFreezeModal}
        onClose={() => setShowFreezeModal(false)}
        title="冻结账户"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowFreezeModal(false)}>取消</Button>
            <Button onClick={handleFreezeAccount}>确认冻结</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-[#EFF3FA] border border-[#DCE5F2] rounded-lg">
            <Snowflake className="w-5 h-5 text-[#7C90BC] shrink-0 mt-0.5" />
            <p className="text-xs text-charcoal-300 leading-relaxed">
              冻结后，这个账户的钱<b className="text-charcoal">不能支出、不能划出攒钱</b>，购买分析也只按可用余额计算。
              钱不会被删除，仍在总资产里，随时可解冻。
            </p>
          </div>
          <Input
            label="备注（可选）"
            placeholder="例如：老婆本"
            value={freezeNote}
            onChange={(e) => setFreezeNote(e.target.value)}
          />
        </div>
      </Modal>

      {/* Category Modal */}
      <Modal
        isOpen={showCategoryModal}
        onClose={() => { setShowCategoryModal(false); setEditingCategoryId(null) }}
        title={editingCategoryId ? '编辑分类' : '新建分类'}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowCategoryModal(false); setEditingCategoryId(null) }}>取消</Button>
            <Button onClick={handleSaveCategory} disabled={!categoryName.trim()}>
              {editingCategoryId ? '保存' : '创建'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="分类名称"
            placeholder="例如：日用品"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
          />
          
          {!editingCategoryId && (
            <Select
              label="类型"
              value={categoryType}
              onChange={(e) => setCategoryType(e.target.value as TransactionType)}
              options={[
                { value: 'expense', label: '支出' },
                { value: 'income', label: '收入' },
              ]}
            />
          )}
          
          <div className="space-y-1">
            <label className="block text-sm font-medium text-charcoal-400">图标</label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORY_ICON_OPTIONS.map((icon) => (
                <button
                  key={icon}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center
                    ${categoryIcon === icon ? 'bg-brown text-white' : 'bg-sand-100 hover:bg-sand-200'}`}
                  onClick={() => setCategoryIcon(icon)}
                >
                  <Icon name={icon} className="w-5 h-5" />
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-1">
            <label className="block text-sm font-medium text-charcoal-400">颜色</label>
            <div className="flex gap-2 flex-wrap">
              {categoryColorOptions.map((color) => (
                <button
                  key={color}
                  className={`w-8 h-8 rounded-full border-2 ${
                    categoryColor === color ? 'border-charcoal' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setCategoryColor(color)}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>
      {/* Clear Data Modal - Step 1 */}
      <Modal
        isOpen={showClearModal1}
        onClose={() => setShowClearModal1(false)}
        title="清除所有数据"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowClearModal1(false)}>取消</Button>
            <Button variant="danger" onClick={() => { setShowClearModal1(false); setShowClearModal2(true) }}>
              我已了解，继续
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3 p-3 bg-terra-50 border border-terra-100 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-terra shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-terra mb-1.5">此操作不可恢复，将删除：</p>
            <ul className="list-disc list-inside text-xs text-charcoal-300 space-y-0.5">
              <li>全部交易记录（含周期自动记账）</li>
              <li>全部「想买的东西」与存钱罐进度</li>
              <li>全部预算设置</li>
              <li>全部周期性收入 / 支出</li>
            </ul>
            <p className="text-xs text-charcoal-300 mt-2">
              账户与分类将重置为初始预设；登录密码与 AI 配置保留。
            </p>
          </div>
        </div>
      </Modal>

      {/* Clear Data Modal - Step 2 */}
      <Modal
        isOpen={showClearModal2}
        onClose={() => { setShowClearModal2(false); setClearConfirmText('') }}
        title="最后确认"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowClearModal2(false); setClearConfirmText('') }}>取消</Button>
            <Button
              variant="danger"
              onClick={handleClearAllData}
              disabled={clearConfirmText !== '清除' || clearing}
            >
              {clearing ? '清除中…' : '确认清除'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-charcoal">
            请输入「<span className="font-medium text-terra">清除</span>」两个字，确认删除所有数据：
          </p>
          <Input
            placeholder="清除"
            value={clearConfirmText}
            onChange={(e) => setClearConfirmText(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  )
}
