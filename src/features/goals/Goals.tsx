import { useState } from 'react'
import { Plus, Calculator } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import GoalList from '../../components/goals/GoalList'
import GoalForm from '../../components/goals/GoalForm'
import PurchaseAnalysisModal from '../../components/goals/PurchaseAnalysisModal'
import Button from '../../components/ui/Button'

export default function Goals() {
  const [showForm, setShowForm] = useState(false)
  const [showQuickAnalysis, setShowQuickAnalysis] = useState(false)
  const goals = useAppStore(state => state.goals)
  
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-semibold text-charcoal">
            想买的东西
          </h1>
          <p className="text-sm text-charcoal-300 mt-1">
            把你想要的东西记下来，慢慢攒钱实现
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowQuickAnalysis(true)}>
            <Calculator className="w-4 h-4 mr-2" />
            随手算算
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            添加想买的东西
          </Button>
        </div>
      </div>
      
      {/* Content：冷静期/已放弃的目标去「省钱」页看，这里只展示正在攒和已完成的 */}
      <GoalList goals={goals.filter(g => g.status !== 'cooling' && g.status !== 'rejected')} />
      
      {/* Form Modal */}
      <GoalForm 
        isOpen={showForm}
        onClose={() => setShowForm(false)}
      />

      {/* Quick Analysis Modal（临时模拟，不限于已有目标） */}
      {showQuickAnalysis && (
        <PurchaseAnalysisModal onClose={() => setShowQuickAnalysis(false)} />
      )}
    </div>
  )
}
