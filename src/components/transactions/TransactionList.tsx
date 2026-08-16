import { useMemo, useState } from 'react'
import { Category, Transaction } from '../../types'
import { formatMoney, formatDate } from '../../utils/format'
import { Trash2, Edit2, Search, X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import Button from '../ui/Button'

interface TransactionListProps {
  categories: Category[]
  onEdit: (transaction: Transaction) => void
}

export default function TransactionList({ categories, onEdit }: TransactionListProps) {
  const transactions = useAppStore(state => state.transactions)
  const deleteTransaction = useAppStore(state => state.deleteTransaction)
  const [query, setQuery] = useState('')

  const getCategoryById = (id: string) => categories.find(c => c.id === id)

  // 搜索过滤：匹配备注、分类名、金额、日期（大小写不敏感）
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return transactions
    return transactions.filter(t => {
      const category = getCategoryById(t.categoryId)
      const note = (t.note || '').toLowerCase()
      const categoryName = (category?.name || '未分类').toLowerCase()
      const moneyStr = formatMoney(t.amount)
      const amountStrs = [
        moneyStr,                          // 2,000.00
        moneyStr.replace(/,/g, ''),        // 2000.00
        String(Math.round(t.amount / 100)), // 2000
      ]
      const dateStrs = [
        t.date,                        // 2026-08-15
        t.date.replace(/-/g, '/'),     // 2026/08/15
        t.date.replace(/-/g, ''),      // 20260815
        t.date.slice(5),               // 08-15
      ]
      return (
        note.includes(q) ||
        categoryName.includes(q) ||
        amountStrs.some(s => s.includes(q)) ||
        dateStrs.some(s => s.includes(q))
      )
    })
  }, [transactions, categories, query])

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-sand-200 p-12 text-center">
        <p className="text-charcoal-300">暂无记录，点击右上角添加第一笔</p>
      </div>
    )
  }
  
  // 按月分组（基于搜索结果）
  const grouped: Record<string, Transaction[]> = {}
  filtered.forEach(t => {
    const month = t.date.slice(0, 7) // YYYY-MM
    if (!grouped[month]) grouped[month] = []
    grouped[month].push(t)
  })
  
  const sortedMonths = Object.keys(grouped).sort().reverse()
  
  const formatMonthLabel = (ym: string) => {
    const [y, m] = ym.split('-')
    return `${y}年${parseInt(m)}月`
  }
  
  return (
    <div className="space-y-4">
      {/* 搜索栏 */}
      <div className="flex items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-300 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索备注、分类、金额或日期"
            className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-sand-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-charcoal-300 hover:text-charcoal transition-colors"
              title="清除搜索"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {query.trim() && (
          <span className="text-xs text-charcoal-300 flex-shrink-0 tabular-nums">
            匹配 {filtered.length} 条 / 共 {transactions.length} 条
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-sand-200 p-12 text-center">
          <p className="text-charcoal-300 mb-3">未找到与“{query.trim()}”匹配的记录</p>
          <Button variant="ghost" size="sm" onClick={() => setQuery('')}>
            清除搜索
          </Button>
        </div>
      ) : (
      <div className="space-y-6">
      {sortedMonths.map(month => {
        const monthTransactions = grouped[month]
        const monthIncome = monthTransactions
          .filter(t => t.type === 'income')
          .reduce((s, t) => s + t.amount, 0)
        const monthExpense = monthTransactions
          .filter(t => t.type === 'expense')
          .reduce((s, t) => s + t.amount, 0)
        
        return (
          <div key={month}>
            {/* Month Header */}
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-sm font-medium text-charcoal-400">
                {formatMonthLabel(month)}
              </h3>
              <div className="flex gap-3 text-xs text-charcoal-300 tabular-nums">
                <span className="text-olive">+{formatMoney(monthIncome)}</span>
                <span className="text-terra">-{formatMoney(monthExpense)}</span>
              </div>
            </div>
            
            <div className="bg-white rounded-lg border border-sand-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-sand-100 bg-sand-100/50">
                    <th className="text-left px-4 py-3 text-sm font-medium text-charcoal-400">日期</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-charcoal-400">类型</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-charcoal-400">分类</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-charcoal-400">金额</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-charcoal-400">备注</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-charcoal-400">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {monthTransactions.map((t) => {
                    const category = getCategoryById(t.categoryId)
                    return (
                      <tr key={t.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-100/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-charcoal">{formatDate(t.date)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            t.type === 'income' 
                              ? 'bg-olive-50 text-olive-500' 
                              : 'bg-terra-50 text-terra-500'
                          }`}>
                            {t.type === 'income' ? '收入' : '支出'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: category?.color || '#8A8580' }}
                            />
                            <span className="text-sm text-charcoal">{category?.name || '未分类'}</span>
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-sm text-right tabular-nums font-medium ${
                          t.type === 'income' ? 'text-olive' : 'text-terra'
                        }`}>
                          {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-charcoal-300 max-w-[200px] truncate">
                          {t.note || '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="p-1" onClick={() => onEdit(t)}>
                              <Edit2 className="w-4 h-4 text-charcoal-300" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="p-1"
                              onClick={() => {
                                if (confirm('确定删除这条记录吗？')) {
                                  deleteTransaction(t.id)
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-terra" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      </div>
      )}
    </div>
  )
}
