import { useEffect, useState } from 'react'
import { UploadCloud, Database, ArrowRight } from 'lucide-react'
import Button from '../../components/ui/Button'
import { toast } from '../../components/ui/Toast'
import { api } from '../../api/client'
import { getLocalCounts, getLocalTableData, LOCAL_TABLES, type LocalCounts } from '../../db/localData'
import { useAppStore } from '../../stores/appStore'

export default function Migrate() {
  const initialize = useAppStore(s => s.initialize)
  const [counts, setCounts] = useState<LocalCounts | null>(null)
  const [migrating, setMigrating] = useState(false)
  const [progress, setProgress] = useState('')

  useEffect(() => {
    getLocalCounts().then(setCounts)
  }, [])

  const finishAndEnter = async () => {
    localStorage.setItem('fp_migrated', '1')
    await initialize({ skipMigrationCheck: true })
  }

  const handleMigrate = async () => {
    if (migrating) return
    setMigrating(true)

    try {
      for (const table of LOCAL_TABLES) {
        if (!counts || counts[table.key] === 0) continue
        setProgress(`正在上传：${table.label}（${counts[table.key]} 条）…`)
        const rows = await getLocalTableData(table.key)
        await api(`/${table.key}/bulk`, { method: 'POST', body: rows })
      }

      setProgress('正在初始化预设数据…')
      await api('/bootstrap', { method: 'POST' })

      toast('本地数据已全部上传到云端', 'success')
      await finishAndEnter()
    } catch (err) {
      toast(err instanceof Error ? `迁移失败：${err.message}` : '迁移失败，请重试', 'error')
    } finally {
      setMigrating(false)
      setProgress('')
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* 标题 */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-brown text-white flex items-center justify-center shadow-sm mb-4">
            <Database className="w-7 h-7" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-display font-semibold tracking-wide text-charcoal">
            发现本地旧数据
          </h1>
          <p className="mt-2 text-sm text-charcoal-300 leading-relaxed">
            这台设备上存有之前离线记录的数据。<br />是否上传到云端数据库，在新版中继续使用？
          </p>
        </div>

        {/* 数据概览卡片 */}
        <div className="bg-white border border-sand-200 rounded-xl p-5 shadow-sm mb-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {LOCAL_TABLES.map(table => (
              <div key={table.key} className="flex items-center justify-between text-sm">
                <span className="text-charcoal-400">{table.label}</span>
                <span className={`font-medium ${counts && counts[table.key] > 0 ? 'text-charcoal' : 'text-charcoal-300'}`}>
                  {counts ? `${counts[table.key]} 条` : '…'}
                </span>
              </div>
            ))}
          </div>
          {counts && (
            <div className="mt-3 pt-3 border-t border-sand-100 flex items-center justify-between">
              <span className="text-sm font-medium text-charcoal">合计</span>
              <span className="text-sm font-semibold text-brown">{counts.total} 条</span>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="space-y-3">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleMigrate}
            disabled={migrating || !counts || counts.total === 0}
          >
            {migrating ? (
              progress || '迁移中…'
            ) : (
              <>
                <UploadCloud className="w-4 h-4 mr-1.5" />
                上传到云端
              </>
            )}
          </Button>

          <button
            onClick={finishAndEnter}
            disabled={migrating}
            className="w-full flex items-center justify-center gap-1 py-2 text-sm text-charcoal-300 hover:text-charcoal transition-colors disabled:opacity-50"
          >
            暂不迁移，从零开始
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-charcoal-300 leading-relaxed">
          上传后本地数据仍会保留为备份，不会被删除
        </p>
      </div>
    </div>
  )
}
