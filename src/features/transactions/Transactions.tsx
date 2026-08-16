import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Transaction } from '../../types'
import { useAppStore } from '../../stores/appStore'
import TransactionList from '../../components/transactions/TransactionList'
import TransactionForm from '../../components/transactions/TransactionForm'
import Button from '../../components/ui/Button'

export default function Transactions() {
  const [showForm, setShowForm] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const categories = useAppStore(state => state.categories)
  
  const handleEdit = (t: Transaction) => {
    setEditingTransaction(t)
    setShowForm(true)
  }
  
  const handleClose = () => {
    setShowForm(false)
    setEditingTransaction(null)
  }
  
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-semibold text-charcoal">
            收支记录
          </h1>
          <p className="text-sm text-charcoal-300 mt-1">
            记录每一笔收入与支出
          </p>
        </div>
        <Button onClick={() => { setEditingTransaction(null); setShowForm(true) }}>
          <Plus className="w-4 h-4 mr-2" />
          添加记录
        </Button>
      </div>
      
      {/* Content */}
      <TransactionList categories={categories} onEdit={handleEdit} />
      
      {/* Form Modal */}
      <TransactionForm 
        isOpen={showForm}
        onClose={handleClose}
        categories={categories}
        editTransaction={editingTransaction}
      />
    </div>
  )
}
