import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '../api/auth'
import { useAuthStore } from '../store/authStore'

export function LoginPage() {
  const setAuth = useAuthStore(s => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => authApi.login(email, password),
    onSuccess: (res) => {
      const { access_token, user } = res.data.data
      setAuth(user, access_token)
      // 페이지 새로고침해서 router/queries 재초기화
      window.location.href = window.location.origin + '/finflow/'
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? '로그인 실패'
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력하세요.')
      return
    }
    loginMutation.mutate({ email, password })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border bg-white p-8 shadow-sm space-y-5"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-base font-bold text-white">FF</div>
          <div>
            <h1 className="text-base font-bold text-gray-900">FinFlow AI</h1>
            <p className="text-xs text-gray-400">로그인</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">아이디 / 이메일</label>
            <input
              type="text"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              autoComplete="username"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
        )}

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loginMutation.isPending ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  )
}
