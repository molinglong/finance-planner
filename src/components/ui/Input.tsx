import { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export default function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-charcoal-400">
          {label}
        </label>
      )}
      <input
        className={`w-full px-3 py-2 text-sm bg-white border rounded-lg 
          focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown
          ${error ? 'border-terra' : 'border-sand-200'}
          ${className}`}
        {...props}
      />
      {error && (
        <p className="text-sm text-terra">{error}</p>
      )}
    </div>
  )
}
