import React from 'react'
import clsx from 'clsx'
import { STATUS_COLORS, STATUS_LABELS } from '../../types'

interface Props {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: Props) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600',
        className,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
