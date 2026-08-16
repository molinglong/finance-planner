import { Goal } from '../../types'
import { formatMoney, calculatePercentage } from '../../utils/format'
import { readableTextColor } from '../../utils/colors'
import { useAppStore } from '../../stores/appStore'
import { Trash2, Plus, Minus, Calculator } from 'lucide-react'
import Icon from '../ui/Icon'
import Button from '../ui/Button'
import { useState } from 'react'
import GoalTransactionForm from './GoalTransactionForm'
import PurchaseAnalysisModal from './PurchaseAnalysisModal'

interface GoalListProps {
  goals: Goal[]
}

export default function GoalList({ goals }: GoalListProps) {
  const deleteGoal = useAppStore(state => state.deleteGoal)
  const [transactionGoal, setTransactionGoal] = useState<Goal | null>(null)
  const [analysisGoal, setAnalysisGoal] = useState<Goal | null>(null)
  
  if (goals.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-sand-200 p-12 text-center">
        <p className="text-charcoal-300">还没有想买的东西，点击右上角添加一个吧</p>
      </div>
    )
  }
  
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {goals.map((goal) => {
          const percentage = calculatePercentage(goal.currentAmount, goal.targetAmount)
          const isCompleted = goal.status === 'completed'
          
          return (
            <div 
              key={goal.id}
              className="bg-white rounded-lg border border-sand-200 p-5"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: goal.color, color: readableTextColor(goal.color) }}
                  >
                    <Icon name={goal.icon} className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-charcoal">{goal.name}</h3>
                    {goal.deadline && (
                      <p className="text-xs text-charcoal-300">
                        截止: {goal.deadline}
                      </p>
                    )}
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="p-1"
                  onClick={() => {
                    if (confirm('确定删除这个目标吗？')) {
                      deleteGoal(goal.id)
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4 text-charcoal-300" />
                </Button>
              </div>
              
              {/* Progress */}
              <div className="mb-4">
                <div className="flex items-end justify-between mb-2">
                  <span className="text-2xl font-semibold text-charcoal tabular-nums">
                    {formatMoney(goal.currentAmount)}
                  </span>
                  <span className="text-sm text-charcoal-300 tabular-nums">
                    / {formatMoney(goal.targetAmount)}
                  </span>
                </div>
                
                {/* Progress Bar */}
                <div className="h-2 bg-sand-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      isCompleted ? 'bg-olive' : 'bg-brown'
                    }`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
                
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-sm font-medium ${
                    isCompleted ? 'text-olive' : 'text-brown'
                  }`}>
                    {percentage}%
                  </span>
                  {!isCompleted && (
                    <span className="text-xs text-charcoal-300">
                      还需 {formatMoney(goal.targetAmount - goal.currentAmount)}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex gap-2">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => setTransactionGoal({ ...goal, _type: 'deposit' } as any)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  攒钱
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="flex-1"
                  onClick={() => setTransactionGoal({ ...goal, _type: 'withdraw' } as any)}
                >
                  <Minus className="w-4 h-4 mr-1" />
                  取出
                </Button>
              </div>
              
              {/* 购买分析入口 */}
              {!isCompleted && (
                <button
                  onClick={() => setAnalysisGoal(goal)}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-brown
                    hover:bg-sand-50 rounded-md transition-colors"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  现在买会怎样？
                </button>
              )}
              
              {/* Status Badge */}
              {isCompleted && (
                <div className="mt-3 pt-3 border-t border-sand-100">
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-olive-50 text-olive">
                    已完成
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      
      {/* Transaction Modal */}
      {transactionGoal && (
        <GoalTransactionForm
          goal={transactionGoal}
          onClose={() => setTransactionGoal(null)}
        />
      )}
      
      {/* Purchase Analysis Modal */}
      {analysisGoal && (
        <PurchaseAnalysisModal
          goal={analysisGoal}
          onClose={() => setAnalysisGoal(null)}
        />
      )}
    </>
  )
}
