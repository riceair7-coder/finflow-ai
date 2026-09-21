import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '../../api/auth'

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  const mutation = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: () => {
      alert('비밀번호가 변경되었습니다.')
      onClose()
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '비밀번호 변경 실패'),
  })

  const canSubmit = current.length > 0 && next.length >= 8 && next === confirm && !mutation.isPending
  const mismatch = confirm.length > 0 && next !== confirm

  const submit = () => {
    if (!canSubmit) return
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">비밀번호 변경</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">현재 비밀번호 *</label>
            <input
              type="password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">새 비밀번호 * (최소 8자)</label>
            <input
              type="password"
              value={next}
              onChange={e => setNext(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">새 비밀번호 확인 *</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              autoComplete="new-password"
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                mismatch
                  ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
                  : 'border-gray-200 focus:border-blue-400 focus:ring-blue-100'
              }`}
            />
            {mismatch && <p className="mt-1 text-xs text-rose-600">새 비밀번호가 일치하지 않습니다.</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">취소</button>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {mutation.isPending ? '변경 중...' : '변경'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
