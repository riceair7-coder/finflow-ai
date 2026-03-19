import React from 'react'
import clsx from 'clsx'

interface Props {
  title: string
  value: string
  change?: string
  changeType?: 'up' | 'down' | 'neutral'
  icon: React.ReactNode
  color: 'blue' | 'green' | 'red' | 'yellow'
}

const colorMap = {
  blue: 'bg-blue-50 border-blue-200',
  green: 'bg-green-50 border-green-200',
  red: 'bg-red-50 border-red-200',
  yellow: 'bg-yellow-50 border-yellow-200',
}

const iconColorMap = {
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-green-100 text-green-600',
  red: 'bg-red-100 text-red-600',
  yellow: 'bg-yellow-100 text-yellow-600',
}

export function FinancialSummaryCard({ title, value, change, changeType = 'neutral', icon, color }: Props) {
  return (
    <div className={clsx('rounded-xl border p-5 shadow-sm', colorMap[color])}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {change && (
            <p
              className={clsx('mt-1 text-xs font-medium', {
                'text-green-600': changeType === 'up',
                'text-red-600': changeType === 'down',
                'text-gray-500': changeType === 'neutral',
              })}
            >
              {changeType === 'up' ? '▲' : changeType === 'down' ? '▼' : ''} {change}
            </p>
          )}
        </div>
        <div className={clsx('rounded-lg p-3', iconColorMap[color])}>{icon}</div>
      </div>
    </div>
  )
}
