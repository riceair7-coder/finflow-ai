import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { departmentsApi, type Department } from '../api/departments'
import { buildDeptPaletteMap, lookupPalette } from '../utils/deptColor'
import clsx from 'clsx'

type FormState = { code: string; name: string; cost_center: string }

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

function DepartmentForm({
  onSubmit, onCancel, defaultValues, loading, editMode,
}: {
  onSubmit: (data: FormState) => void
  onCancel: () => void
  defaultValues?: Partial<FormState>
  loading?: boolean
  editMode?: boolean
}) {
  const [form, setForm] = useState<FormState>({
    code: defaultValues?.code ?? '',
    name: defaultValues?.name ?? '',
    cost_center: defaultValues?.cost_center ?? '',
  })

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  const canSubmit = form.code.trim().length > 0 && form.name.trim().length > 0

  return (
    <div className="p-6 space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">부서 코드 *</label>
        <input
          value={form.code}
          onChange={set('code')}
          disabled={editMode}
          placeholder="예: DEV"
          className={clsx(
            'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2',
            editMode
              ? 'border-gray-100 bg-gray-50 text-gray-500'
              : 'border-gray-200 focus:border-blue-400 focus:ring-blue-100',
          )}
        />
        {editMode && <p className="mt-1 text-xs text-gray-400">코드는 변경할 수 없습니다.</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">부서명 *</label>
        <input value={form.name} onChange={set('name')} placeholder="예: 개발팀"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">코스트 센터</label>
        <input value={form.cost_center} onChange={set('cost_center')} placeholder="선택 입력 (예: CC001)"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
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

export function DepartmentsPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState<Department | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['departments', showInactive],
    queryFn: () => departmentsApi.list(showInactive ? undefined : { is_active: true }),
  })
  const departments = data?.data.data ?? []
  // 활성 부서 기준으로 색 매핑 (비활성 포함 모드여도 활성 부서 색은 그대로 유지)
  const paletteMap = buildDeptPaletteMap(departments.filter(d => d.is_active))

  const createMutation = useMutation({
    mutationFn: (body: FormState) =>
      departmentsApi.create({
        code: body.code.trim(),
        name: body.name.trim(),
        cost_center: body.cost_center.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] })
      setShowAdd(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: FormState }) =>
      departmentsApi.update(id, {
        name: body.name.trim(),
        cost_center: body.cost_center.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] })
      setEditTarget(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => departmentsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => departmentsApi.update(id, { is_active: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">부서 관리</h2>
          <p className="mt-0.5 text-sm text-gray-400">
            공급자에 담당 부서를 지정하면, 이후 거래는 자동으로 해당 부서로 분류됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            비활성 부서 포함
          </label>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            + 부서 등록
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="px-5 py-3">코드</th>
              <th className="px-5 py-3">부서명</th>
              <th className="px-5 py-3">코스트 센터</th>
              <th className="px-5 py-3">상태</th>
              <th className="px-5 py-3 text-right">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} className="px-5 py-3.5"><div className="h-4 animate-pulse rounded bg-gray-100" /></td>
                ))}</tr>
              ))
            ) : departments.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">
                  등록된 부서가 없습니다. 우측 상단 "부서 등록"으로 추가하세요.
                </td>
              </tr>
            ) : (
              departments.map(d => {
                const palette = lookupPalette(paletteMap, d.code || d.id)
                return (
                <tr key={d.id} className={clsx('hover:bg-gray-50 transition-colors', palette.rowBorder)}>
                  <td className="px-5 py-3.5 font-mono text-xs text-gray-700">
                    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5', palette.badge)}>
                      <span className={clsx('h-2 w-2 rounded-full', palette.dot)} />
                      {d.code}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-gray-900">{d.name}</td>
                  <td className="px-5 py-3.5 text-gray-500">{d.cost_center || <span className="text-gray-300">-</span>}</td>
                  <td className="px-5 py-3.5">
                    {d.is_active
                      ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">활성</span>
                      : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">비활성</span>}
                  </td>
                  <td className="px-5 py-3.5 text-right space-x-2">
                    <button onClick={() => setEditTarget(d)} className="rounded-lg px-3 py-1 text-xs text-blue-700 hover:bg-blue-50">수정</button>
                    {d.is_active ? (
                      <button
                        onClick={() => {
                          if (confirm(`'${d.name}' 부서를 비활성화하시겠습니까?\n공급자에 이미 할당된 기록은 유지됩니다.`)) {
                            deleteMutation.mutate(d.id)
                          }
                        }}
                        className="rounded-lg px-3 py-1 text-xs text-rose-700 hover:bg-rose-50"
                      >
                        비활성화
                      </button>
                    ) : (
                      <button
                        onClick={() => reactivateMutation.mutate(d.id)}
                        className="rounded-lg px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                      >
                        재활성화
                      </button>
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
        <Modal title="부서 등록" onClose={() => setShowAdd(false)}>
          <DepartmentForm
            onSubmit={createMutation.mutate}
            onCancel={() => setShowAdd(false)}
            loading={createMutation.isPending}
          />
        </Modal>
      )}

      {editTarget && (
        <Modal title="부서 수정" onClose={() => setEditTarget(null)}>
          <DepartmentForm
            editMode
            defaultValues={{
              code: editTarget.code,
              name: editTarget.name,
              cost_center: editTarget.cost_center ?? '',
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
