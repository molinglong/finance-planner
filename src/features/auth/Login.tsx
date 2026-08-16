import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Wallet, KeyRound, ShieldCheck, Server } from 'lucide-react'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { toast } from '../../components/ui/Toast'
import { useAppStore } from '../../stores/appStore'
import { setApiBase, API_BASE } from '../../api/client'

export default function Login() {
  const authStatus = useAppStore(s => s.authStatus)
  const login = useAppStore(s => s.login)
  const setup = useAppStore(s => s.setup)

  const isSetup = authStatus === 'needSetup'

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 服务器地址配置（原生 App 专属，真机需改为局域网 IP）
  const isNative = Capacitor.isNativePlatform()
  const [serverUrl, setServerUrl] = useState(API_BASE || '')
  const isDefaultUrl = API_BASE === 'http://10.0.2.2:3001'
  const [showServerConfig, setShowServerConfig] = useState(isNative && isDefaultUrl)

  const handleSaveServerUrl = () => {
    const url = serverUrl.trim().replace(/\/+$/, '')
    if (!url) return
    setApiBase(url)
    toast('服务器地址已保存，正在重新加载…', 'success')
    setTimeout(() => window.location.reload(), 800)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    if (!password) {
      toast('请输入密码', 'error')
      return
    }

    try {
      setSubmitting(true)
      if (isSetup) {
        if (password.length < 4) {
          toast('密码至少 4 位', 'error')
          return
        }
        if (password !== confirm) {
          toast('两次输入的密码不一致', 'error')
          return
        }
        await setup(password)
        toast('密码设置成功，欢迎使用！', 'success')
      } else {
        await login(password)
        toast('登录成功', 'success')
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : '操作失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brown text-white flex items-center justify-center shadow-sm mb-4">
            <Wallet className="w-7 h-7" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-display font-semibold tracking-wide text-charcoal">
            财务规划助手
          </h1>
          <p className="mt-2 text-sm text-charcoal-300">
            {isSetup ? '首次使用，请设置访问密码' : '云端数据 · 请登录继续'}
          </p>
        </div>

        {/* 表单卡片 */}
        <form onSubmit={handleSubmit} className="bg-white border border-sand-200 rounded-xl p-6 space-y-4 shadow-sm">
          <Input
            label="访问密码"
            type="password"
            placeholder={isSetup ? '设置密码（至少 4 位）' : '请输入密码'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
          />

          {isSetup && (
            <Input
              label="确认密码"
              type="password"
              placeholder="再输入一次"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
            />
          )}

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? '请稍候…' : isSetup ? '开始使用' : '登录'}
          </Button>

          <div className="flex items-center gap-2 pt-1 text-xs text-charcoal-300">
            {isSetup ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                <span>密码保存在本机数据库，用于保护你的财务数据</span>
              </>
            ) : (
              <>
                <KeyRound className="w-3.5 h-3.5 flex-shrink-0" />
                <span>数据存储于本机服务端，多设备可用同一密码访问</span>
              </>
            )}
          </div>
        </form>

        {/* 服务器地址配置（原生 App 专属） */}
        {isNative && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowServerConfig(!showServerConfig)}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-charcoal-300 hover:text-charcoal transition-colors py-2"
            >
              <Server className="w-3.5 h-3.5" />
              {showServerConfig ? '收起服务器设置' : '服务器设置'}
            </button>
            {showServerConfig && (
              <div className="bg-white border border-sand-200 rounded-xl p-4 space-y-2 shadow-sm">
                <label className="block text-xs font-medium text-charcoal-400">服务器地址</label>
                <div className="flex gap-2">
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
                <p className="text-xs text-charcoal-300">
                  电脑上运行后端服务后，填入电脑的局域网 IP（如 http://192.168.31.87:3001）
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
