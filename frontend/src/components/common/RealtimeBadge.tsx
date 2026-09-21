import { useWsStore } from '../../store/wsStore'

const MAP = {
  open:       { cls: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500 animate-pulse', label: '실시간 연동' },
  connecting: { cls: 'bg-amber-50 text-amber-600',     dot: 'bg-amber-500 animate-pulse',   label: '연결 중…' },
  closed:     { cls: 'bg-amber-50 text-amber-600',     dot: 'bg-amber-500 animate-pulse',   label: '재연결 중…' },
  failed:     { cls: 'bg-rose-50 text-rose-600',       dot: 'bg-rose-500',                  label: '실시간 연결 끊김' },
} as const

/** WebSocket 실제 상태를 그대로 보여주는 배지 (예전에는 항상 초록으로 고정되어 있었음) */
export function RealtimeBadge() {
  const status = useWsStore(s => s.status)
  const retry = useWsStore(s => s.retry)
  const v = MAP[status]

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`실시간 연동 상태: ${v.label}`}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${v.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />
      {v.label}
      {status === 'failed' && (
        <button
          type="button"
          onClick={() => (retry ? retry() : window.location.reload())}
          className="ml-1 rounded px-1.5 py-0.5 font-semibold underline underline-offset-2 hover:bg-rose-100"
        >
          다시 연결
        </button>
      )}
    </span>
  )
}
