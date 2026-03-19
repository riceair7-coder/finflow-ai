import React, { useEffect } from 'react'
import clsx from 'clsx'
import { useNotificationStore } from '../../store/notificationStore'

const typeStyles = {
  success: 'border-l-4 border-green-500 bg-white',
  error: 'border-l-4 border-red-500 bg-white',
  info: 'border-l-4 border-blue-500 bg-white',
  warning: 'border-l-4 border-yellow-500 bg-white',
}

const typeIcons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' }

function Toast({ id, type, title, message }: { id: string; type: string; title: string; message: string }) {
  const remove = useNotificationStore((s) => s.remove)

  useEffect(() => {
    const timer = setTimeout(() => remove(id), 5_000)
    return () => clearTimeout(timer)
  }, [id, remove])

  return (
    <div
      className={clsx(
        'pointer-events-auto flex w-80 items-start gap-3 rounded-lg p-4 shadow-lg',
        typeStyles[type as keyof typeof typeStyles],
      )}
    >
      <span className="text-lg">{typeIcons[type as keyof typeof typeIcons]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 text-xs text-gray-500 truncate">{message}</p>
      </div>
      <button onClick={() => remove(id)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
    </div>
  )
}

export function NotificationToastContainer() {
  const notifications = useNotificationStore((s) => s.notifications)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {notifications.map((n) => (
        <Toast key={n.id} {...n} />
      ))}
    </div>
  )
}
