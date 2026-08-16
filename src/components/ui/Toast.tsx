import { useEffect, useState } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

let addToastGlobal: ((message: string, type: Toast['type']) => void) | null = null

export const toast = (message: string, type: Toast['type'] = 'info') => {
  if (addToastGlobal) {
    addToastGlobal(message, type)
  }
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])
  
  useEffect(() => {
    addToastGlobal = (message: string, type: Toast['type']) => {
      const id = Math.random().toString(36).substring(7)
      setToasts(prev => [...prev, { id, message, type }])
      
      // Auto remove after 5 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 5000)
    }
    
    return () => {
      addToastGlobal = null
    }
  }, [])
  
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }
  
  const getIcon = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-olive" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-terra" />
      case 'info':
        return <Info className="w-5 h-5 text-brown" />
    }
  }
  
  if (toasts.length === 0) return null
  
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-center gap-3 px-4 py-3 bg-white border border-sand-200 rounded-lg animate-slide-in min-w-[300px] max-w-[400px] shadow-md"
        >
          {getIcon(toast.type)}
          <p className="flex-1 text-sm text-charcoal">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-charcoal-300 hover:text-charcoal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
