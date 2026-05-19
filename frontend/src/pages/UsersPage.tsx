import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi, type User, type UserCreate, type UserUpdate, type UserRole } from '../api/users'
import { departmentsApi, type Department } from '../api/departments'
import { useAuthStore } from '../store/authStore'
import clsx from 'clsx'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

interface FormState {
  email: string
  password: string
  name: string
  department_id: string
  role: UserRole
}

function UserForm({
  departments, onSubmit, onCancel, loading, defaultValues, editMode,
}: {
  departments: Department[]
  onSubmit: (data: FormState) => void
  onCancel: () => void
  loading?: boolean
  defaultValues?: Partial<FormState>
  editMode?: boolean
}) {
  const [form, setForm] = useState<FormState>({
    email: defaultValues?.email ?? '',
    password: '',
    name: defaultValues?.name ?? '',
    department_id: defaultValues?.department_id ?? '',
    role: defaultValues?.role ?? 'member',
  })

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value as any }))

  const canSubmit = editMode
    ? form.email.trim().length > 0
    : form.email.trim().length > 0 && form.password.length >= 8

  return (
    <div className="p-6 space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">아이디 / 이메일 *</label>
        <input
          type="text"
          value={form.email}
          onChange={set('email')}
          disabled={editMode}
          className={clsx(
            'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2',
            editMode ? 'border-gray-100 bg-gray-50 text-gray-500' : 'border-gray-200 focus:border-blue-400 focus:ring-blue-100',
          )}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          비밀번호 {editMode ? '(변경 시 입력, 최소 8자)' : '* (최소 8자)'}
        </label>
        <input
          type="password"
          value={form.password}
          onChange={set('password')}
          autoComplete="new-password"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">이름</label>
        <input value={form.name} onChange={set('name')}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">담당 부서</label>
          <select value={form.department_id} onChange={set('department_id')}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none">
            <option value="">— 미배정 —</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">역할</label>
          <select value={form.role} onChange={set('role')}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none">
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">취소</button>
        <button
          onClick={() => onSubmit(form)}
          disabled={!canSubmit || loading}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '저장 중...' : editMode ? '수정' : '등록'}
        </button>
      </div>
    </div>
  )
}

export function UsersPage() {
  const qc = useQueryClient()
  const me = useAuthStore(s => s.user)
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['users', showInactive],
    queryFn: () => usersApi.list(showInactive ? { limit: 200 } : { is_active: true, limit: 200 }),
  })
  const users = data?.data.data ?? []

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentsApi.list({ is_active: true }),
  })
  const departments = deptData?.data.data ?? []
  const deptMap = Object.fromEntries(departments.map(d => [d.id, d]))

  const createMutation = useMutation({
    mutationFn: (body: FormState) => usersApi.create({
      email: body.email.trim(),
      password: body.password,
      name: body.name.trim() || undefined,
      department_id: body.department_id || undefined,
      role: body.role,
    } as UserCreate),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setShowAdd(false) },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '등록 실패'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: FormState }) => {
      const data: UserUpdate = {
        name: body.name.trim() || undefined,
        department_id: body.department_id || null,
        role: body.role,
      }
      if (body.password) data.password = body.password
      return usersApi.update(id, data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setEditTarget(null) },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '수정 실패'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (err: any) => alert(err?.response?.data?.detail ?? '비활성화 실패'),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">사용자 관리</h2>
          <p className="mt-0.5 text-sm text-gray-400">계정/부서/권한을 관리합니다. (admin 전용)</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            비활성 포함
          </label>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            + 사용자 추가
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="px-5 py-3">이메일</th>
              <th className="px-5 py-3">이름</th>
              <th className="px-5 py-3">부서</th>
              <th className="px-5 py-3">역할</th>
              <th className="px-5 py-3">상태</th>
              <th className="px-5 py-3">최근 로그인</th>
              <th className="px-5 py-3 text-right">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                  <td key={j} className="px-5 py-3.5"><div className="h-4 animate-pulse rounded bg-gray-100" /></td>
                ))}</tr>
              ))
            ) : users.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">등록된 사용자가 없습니다.</td></tr>
            ) : (
              users.map(u => {
                const dept = u.department_id ? deptMap[u.department_id] : null
                const isMe = me?.id === u.id
                return (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-700">{u.email}{isMe && <span className="ml-1 text-blue-500">(나)</span>}</td>
                    <td className="px-5 py-3.5 font-medium text-gray-900">{u.name ?? '-'}</td>
                    <td className="px-5 py-3.5">
                      {dept
                        ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{dept.name}</span>
                        : <span className="text-xs text-gray-300">미배정</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={clsx(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        u.role === 'admin' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600',
                      )}>{u.role}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {u.is_active
                        ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">활성</span>
                        : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">비활성</span>}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-500">
                      {u.last_login_at ? u.last_login_at.slice(0, 16).replace('T', ' ') : '-'}
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2">
                      <button onClick={() => setEditTarget(u)} className="rounded-lg px-3 py-1 text-xs text-blue-700 hover:bg-blue-50">수정</button>
                      {!isMe && u.is_active && (
                        <button
                          onClick={() => {
                            if (confirm(`${u.email}을(를) 비활성화하시겠습니까?`)) deleteMutation.mutate(u.id)
                          }}
                          className="rounded-lg px-3 py-1 text-xs text-rose-700 hover:bg-rose-50"
                        >비활성화</button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal title="사용자 추가" onClose={() => setShowAdd(false)}>
          <UserForm
            departments={departments}
            onSubmit={createMutation.mutate}
            onCancel={() => setShowAdd(false)}
            loading={createMutation.isPending}
          />
        </Modal>
      )}

      {editTarget && (
        <Modal title="사용자 수정" onClose={() => setEditTarget(null)}>
          <UserForm
            editMode
            departments={departments}
            defaultValues={{
              email: editTarget.email,
              name: editTarget.name ?? '',
              department_id: editTarget.department_id ?? '',
              role: editTarget.role,
            }}
            onSubmit={(body) => updateMutation.mutate({ id: editTarget.id, body })}
            onCancel={() => setEditTarget(null)}
            loading={updateMutation.isPending}
          />
        </Modal>
      )}
    </div>
  )
}
