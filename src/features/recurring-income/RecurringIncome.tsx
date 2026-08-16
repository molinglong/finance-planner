import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { formatMoney, yuanToCent } from '../../utils/format'
import { readableTextColor } from '../../utils/colors'
import { Plus, Trash2, Play, Pause, Calendar } from 'lucide-react'
import Icon from '../../components/ui/Icon'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Select from '../../components/ui/Select'
import { RecurringFrequency } from '../../types'
import { format } from 'date-fns'

export default function RecurringIncome() {
  const recurringIncomes = useAppStore(state => state.recurringIncomes)
  const accounts = useAppStore(state => state.accounts)
  const categories = useAppStore(state => state.categories)
  const addRecurringIncome = useAppStore(state => state.addRecurringIncome)
  const updateRecurringIncome = useAppStore(state => state.updateRecurringIncome)
  const deleteRecurringIncome = useAppStore(state => state.deleteRecurringIncome)
  const toggleRecurringIncome = useAppStore(state => state.toggleRecurringIncome)
  const getDefaultCategoryId = useAppStore(state => state.getDefaultCategoryId)
  
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  // Form state
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [dayOfMonth, setDayOfMonth] = useState('21')
  const [dayOfWeek, setDayOfWeek] = useState('1')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [note, setNote] = useState('')
  
  const incomeCategories = categories.filter(c => c.type === 'income')
  
  const resetForm = () => {
    setName('')
    setAmount('')
    setFrequency('monthly')
    setDayOfMonth('21')
    setDayOfWeek('1')
    setAccountId('')
    setCategoryId('')
    setStartDate(format(new Date(), 'yyyy-MM-dd'))
    setNote('')
  }
  
  const handleAdd = async () => {
    if (!name || !amount || !accountId) return
    
    const finalCategoryId = categoryId || getDefaultCategoryId('income')
    
    await addRecurringIncome({
      name,
      amount: yuanToCent(parseFloat(amount)),
      frequency,
      dayOfMonth: frequency === 'monthly' ? parseInt(dayOfMonth) : undefined,
      dayOfWeek: frequency === 'weekly' ? parseInt(dayOfWeek) : undefined,
      accountId,
      categoryId: finalCategoryId,
      startDate,
      note: note || undefined,
      isEnabled: true,
    })
    
    resetForm()
    setShowAddModal(false)
  }
  
  const handleEdit = async () => {
    if (!editingId || !name || !amount || !accountId) return
    
    const finalCategoryId = categoryId || getDefaultCategoryId('income')
    
    await updateRecurringIncome(editingId, {
      name,
      amount: yuanToCent(parseFloat(amount)),
      frequency,
      dayOfMonth: frequency === 'monthly' ? parseInt(dayOfMonth) : undefined,
      dayOfWeek: frequency === 'weekly' ? parseInt(dayOfWeek) : undefined,
      accountId,
      categoryId: finalCategoryId,
      startDate,
      note: note || undefined,
    })
    
    resetForm()
    setShowEditModal(false)
    setEditingId(null)
  }
  
  const openEditModal = (id: string) => {
    const income = recurringIncomes.find(i => i.id === id)
    if (!income) return
    
    setEditingId(id)
    setName(income.name)
    setAmount((income.amount / 100).toString())
    setFrequency(income.frequency)
    setDayOfMonth(income.dayOfMonth?.toString() || '1')
    setDayOfWeek(income.dayOfWeek?.toString() || '1')
    setAccountId(income.accountId)
    setCategoryId(income.categoryId)
    setStartDate(income.startDate)
    setNote(income.note || '')
    setShowEditModal(true)
  }
  
  const getFrequencyLabel = (freq: RecurringFrequency, dayOfMonth?: number, dayOfWeek?: number, startDate?: string): string => {
    switch (freq) {
      case 'daily':
        return '每天'
      case 'weekly':
        const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
        return `每周${weekDays[dayOfWeek || 0]}`
      case 'monthly':
        return `每月${dayOfMonth || 1}号`
      case 'yearly': {
        // 服务端按 startDate 的月日触发（与 shouldProcessToday 一致），不用 dayOfMonth
        const [, sm, sd] = (startDate || '').split('-')
        return sm ? `每年${parseInt(sm)}月${parseInt(sd)}日` : '每年'
      }
      default:
        return ''
    }
  }
  
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-semibold text-charcoal">
            周期性收入
          </h1>
          <p className="text-sm text-charcoal-300 mt-1">
            设置工资、生活费等周期性收入，系统会自动记录
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="w-4 h-4 mr-1" />
          添加
        </Button>
      </div>
      
      {/* List */}
      {recurringIncomes.length > 0 ? (
        <div className="space-y-3">
          {recurringIncomes.map((income) => {
            const account = accounts.find(a => a.id === income.accountId)
            const category = incomeCategories.find(c => c.id === income.categoryId)
            
            return (
              <Card key={income.id} className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-12 h-12 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: category?.color || '#8B7355', color: readableTextColor(category?.color || '#8B7355') }}
                    >
                      <Icon name={category?.icon || 'coins'} className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-charcoal">{income.name}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          income.isEnabled 
                            ? 'bg-olive-50 text-olive' 
                            : 'bg-charcoal-100 text-charcoal-300'
                        }`}>
                          {income.isEnabled ? '启用' : '暂停'}
                        </span>
                      </div>
                      <p className="text-sm text-charcoal-300 mt-1">
                        {getFrequencyLabel(income.frequency, income.dayOfMonth, income.dayOfWeek, income.startDate)}
                        {income.lastProcessed && (
                          <span className="ml-2">
                            · 上次: {income.lastProcessed}
                          </span>
                        )}
                      </p>
                      {account && (
                        <p className="text-xs text-charcoal-300 mt-1">
                          入账: {account.name}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-semibold text-charcoal tabular-nums">
                      {formatMoney(income.amount)}
                    </p>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => toggleRecurringIncome(income.id, !income.isEnabled)}
                      >
                        {income.isEnabled ? (
                          <Pause className="w-4 h-4 text-charcoal-300" />
                        ) : (
                          <Play className="w-4 h-4 text-olive" />
                        )}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => openEditModal(income.id)}
                      >
                        <Calendar className="w-4 h-4 text-charcoal-300" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          if (confirm('确定删除这个周期性收入吗？')) {
                            deleteRecurringIncome(income.id)
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-terra" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <p className="text-charcoal-300 mb-4">还没有周期性收入</p>
          <Button onClick={() => setShowAddModal(true)}>添加第一个</Button>
        </Card>
      )}
      
      {/* Add Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => { resetForm(); setShowAddModal(false) }}
        title="添加周期性收入"
        footer={
          <>
            <Button variant="secondary" onClick={() => { resetForm(); setShowAddModal(false) }}>取消</Button>
            <Button onClick={handleAdd} disabled={!name || !amount || !accountId}>添加</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="名称"
            placeholder="例如：工资、生活费"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          
          <Input
            label="金额"
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            min="0"
          />
          
          <Select
            label="频率"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
            options={[
              { value: 'daily', label: '每天' },
              { value: 'weekly', label: '每周' },
              { value: 'monthly', label: '每月' },
              { value: 'yearly', label: '每年' },
            ]}
          />
          
          {frequency === 'weekly' && (
            <Select
              label="星期几"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              options={[
                { value: '0', label: '周日' },
                { value: '1', label: '周一' },
                { value: '2', label: '周二' },
                { value: '3', label: '周三' },
                { value: '4', label: '周四' },
                { value: '5', label: '周五' },
                { value: '6', label: '周六' },
              ]}
            />
          )}
          
          {frequency === 'monthly' && (
            <Input
              label="几号"
              type="number"
              placeholder="1-31"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
              min="1"
              max="31"
            />
          )}
          
          {frequency === 'yearly' && (
            <p className="text-xs text-charcoal-300">
              每年在「开始日期」的月日当天自动记账（如开始日期为 3月5日，则每年 3月5日）
            </p>
          )}
          
          <Select
            label="入账账户"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            options={[
              { value: '', label: '请选择账户' },
              ...accounts.map(a => ({ value: a.id, label: a.name })),
            ]}
          />
          
          <Select
            label="收入分类（可选）"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={[
              { value: '', label: '默认：未分类' },
              ...incomeCategories.map(c => ({ value: c.id, label: c.name })),
            ]}
          />
          
          <Input
            label="开始日期"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          
          <div className="space-y-1">
            <label className="block text-sm font-medium text-charcoal-400">备注</label>
            <textarea
              className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown
                resize-none"
              rows={2}
              placeholder="可选备注..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      </Modal>
      
      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => { resetForm(); setShowEditModal(false); setEditingId(null) }}
        title="编辑周期性收入"
        footer={
          <>
            <Button variant="secondary" onClick={() => { resetForm(); setShowEditModal(false); setEditingId(null) }}>取消</Button>
            <Button onClick={handleEdit} disabled={!name || !amount || !accountId}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="名称"
            placeholder="例如：工资、生活费"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          
          <Input
            label="金额"
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            min="0"
          />
          
          <Select
            label="频率"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
            options={[
              { value: 'daily', label: '每天' },
              { value: 'weekly', label: '每周' },
              { value: 'monthly', label: '每月' },
              { value: 'yearly', label: '每年' },
            ]}
          />
          
          {frequency === 'weekly' && (
            <Select
              label="星期几"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              options={[
                { value: '0', label: '周日' },
                { value: '1', label: '周一' },
                { value: '2', label: '周二' },
                { value: '3', label: '周三' },
                { value: '4', label: '周四' },
                { value: '5', label: '周五' },
                { value: '6', label: '周六' },
              ]}
            />
          )}
          
          {frequency === 'monthly' && (
            <Input
              label="几号"
              type="number"
              placeholder="1-31"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
              min="1"
              max="31"
            />
          )}
          
          {frequency === 'yearly' && (
            <p className="text-xs text-charcoal-300">
              每年在「开始日期」的月日当天自动记账（如开始日期为 3月5日，则每年 3月5日）
            </p>
          )}
          
          <Select
            label="入账账户"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            options={[
              { value: '', label: '请选择账户' },
              ...accounts.map(a => ({ value: a.id, label: a.name })),
            ]}
          />
          
          <Select
            label="收入分类（可选）"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={[
              { value: '', label: '默认：未分类' },
              ...incomeCategories.map(c => ({ value: c.id, label: c.name })),
            ]}
          />
          
          <Input
            label="开始日期"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          
          <div className="space-y-1">
            <label className="block text-sm font-medium text-charcoal-400">备注</label>
            <textarea
              className="w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown
                resize-none"
              rows={2}
              placeholder="可选备注..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
