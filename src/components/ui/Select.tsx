import { SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string; disabled?: boolean }[]
}

export default function Select({ label, options, className = '', ...props }: SelectProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-charcoal-400">
          {label}
        </label>
      )}
      <select
        className={`w-full px-3 py-2 text-sm bg-white border border-sand-200 rounded-lg
          focus:outline-none focus:ring-2 focus:ring-brown-200 focus:border-brown
          ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
