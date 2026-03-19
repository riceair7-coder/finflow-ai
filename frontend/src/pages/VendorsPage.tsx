import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { vendorsApi, type Vendor, type VendorCreate } from '../api/vendors'
import { departmentsApi, type Department } from '../api/departments'

function fmtBRN(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 5) return `${d.slice(0,3)}-${d.slice(3)}`
  return `${d.slice(0,3)}-${d.slice(3,5)}-${d.slice(5)}`
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{children}</span>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function VendorForm({
  departments, onSubmit, onCancel, defaultValues, loading,
}: {
  departments: Department[]
  onSubmit: (data: VendorCreate) => void
  onCancel: () => void
  defaultValues?: Partial<VendorCreate>
  loading?: boolean
}) {
  const [form, setForm] = useState<VendorCreate>({
    business_registration_no: defaultValues?.business_registration_no ?? '',
    name: defaultValues?.name ?? '',
    representative: defaultValues?.representative ?? '',
    phone: defaultValues?.phone ?? '',
    email: defaultValues?.email ?? '',
    payment_terms_days: defaultValues?.payment_terms_days ?? 30,
    department_id: defaultValues?.department_id ?? '',
    address: defaultValues?.address ?? '',
  })

  const set = (k: keyof VendorCreate) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  const handleBRN = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, business_registration_no: e.target.value.replace(/\D/g, '').slice(0, 10) }))
  }

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">사업자등록번호 *</label>
          <input
            value={fmtBRN(form.business_registration_no)}
            onChange={handleBRN}
            placeholder="000-00-00000"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">공급자명 *</label>
          <input value={form.name} onChange={set('name')} placeholder="(주)회사이름"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">담당 부서</label>
          <select value={form.department_id ?? ''} onChange={set('department_id')}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
            <option value="">부서 선택</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">대표자</label>
          <input value={form.representative ?? ''} onChange={set('representative')} placeholder="홍길동"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">연락처</label>
          <input value={form.phone ?? ''} onChange={set('phone')} placeholder="02-0000-0000"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">이메일</label>
          <input value={form.email ?? ''} onChange={set('email')} placeholder="contact@example.com"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">결제 조건 (일)</label>
          <input type="number" value={form.payment_terms_days} onChange={set('payment_terms_days')} min={0}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">취소</button>
        <button
          onClick={() => onSubmit(form)}
          disabled={loading || !form.business_registration_no || !form.name}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}

export function VendorsPage() {
  const qc = useQueryClient()
  const [selectedDept, setSelectedDept] = useState<string>('')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState<Vendor | null>(null)

  const { data: deptData } = useQuery({ queryKey: ['departments'], queryFn: () => departmentsApi.list() })
  const departments = deptData?.data.data ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', selectedDept, search],
    queryFn: () => vendorsApi.list({ department_id: selectedDept || undefined, search: search || undefined, limit: 100 }),
  })
  const vendors = data?.data.data ?? []

  const createMutation = useMutation({
    mutationFn: vendorsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); setShowAdd(false) },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<VendorCreate> }) => vendorsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); setEditTarget(null) },
  })
  const deleteMutation = useMutation({
    mutationFn: vendorsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  })

  const deptMap = Object.fromEntries(departments.map(d => [d.id, d]))

  const grouped = selectedDept
    ? { [selectedDept]: vendors }
    : vendors.reduce<Record<string, Vendor[]>>((acc, v) => {
        const key = v.department_id ?? '__none__'
        acc[key] = [...(acc[key] ?? []), v]
        return acc
      }, {})

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">공급자 관리</h2>
          <p className="mt-0.5 text-sm text-gray-400">부서별 공급자(거래처)를 등록하고 사업자번호로 자동 분류합니다</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          <span className="text-base">+</span> 공급자 등록
        </button>
      </div>

      {/* 필터 */}
      <div className="flex gap-3">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="공급자명 또는 사업자번호 검색..."
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <select
          value={selectedDept} onChange={e => setSelectedDept(e.target.value)}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm focus:border-blue-400 focus:outline-none"
        >
          <option value="">전체 부서</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {/* 부서별 그룹 */}
      {isLoading ? (
        <div className="space-y-4">
          {[1,2].map(i => <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      ) : vendors.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-16">
          <span className="text-4xl">🏢</span>
          <p className="mt-3 text-sm font-medium text-gray-500">등록된 공급자가 없습니다</p>
          <button onClick={() => setShowAdd(true)} className="mt-4 text-sm text-blue-600 hover:underline">첫 공급자 등록하기</button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([deptId, list]) => {
            const dept = deptMap[deptId]
            return (
              <div key={deptId} className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 border-b bg-gray-50 px-5 py-3">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <h3 className="text-sm font-semibold text-gray-700">
                    {dept ? `${dept.name} (${dept.code})` : '미배정'}
                  </h3>
                  <span className="ml-auto rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">{list.length}개</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                      <th className="px-5 py-3">공급자명</th>
                      <th className="px-5 py-3">사업자번호</th>
                      <th className="px-5 py-3">대표자</th>
                      <th className="px-5 py-3">연락처</th>
                      <th className="px-5 py-3">결제조건</th>
                      <th className="px-5 py-3">상태</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {list.map(v => (
                      <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-gray-900">{v.name}</td>
                        <td className="px-5 py-3.5 font-mono text-gray-500">{fmtBRN(v.business_registration_no)}</td>
                        <td className="px-5 py-3.5 text-gray-500">{v.representative ?? '-'}</td>
                        <td className="px-5 py-3.5 text-gray-500">{v.phone ?? v.email ?? '-'}</td>
                        <td className="px-5 py-3.5 text-gray-500">NET {v.payment_terms_days}일</td>
                        <td className="px-5 py-3.5">
                          {v.is_active
                            ? <Badge color="bg-emerald-50 text-emerald-700">활성</Badge>
                            : <Badge color="bg-gray-100 text-gray-500">비활성</Badge>}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex gap-2">
                            <button onClick={() => setEditTarget(v)}
                              className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">수정</button>
                            <button onClick={() => deleteMutation.mutate(v.id)}
                              className="rounded-lg border border-red-100 px-3 py-1 text-xs text-red-500 hover:bg-red-50">비활성화</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {/* 등록 모달 */}
      {showAdd && (
        <Modal title="공급자 등록" onClose={() => setShowAdd(false)}>
          <VendorForm
            departments={departments}
            loading={createMutation.isPending}
            onCancel={() => setShowAdd(false)}
            onSubmit={data => createMutation.mutate(data)}
          />
        </Modal>
      )}

      {/* 수정 모달 */}
      {editTarget && (
        <Modal title="공급자 수정" onClose={() => setEditTarget(null)}>
          <VendorForm
            departments={departments}
            loading={updateMutation.isPending}
            defaultValues={editTarget}
            onCancel={() => setEditTarget(null)}
            onSubmit={data => updateMutation.mutate({ id: editTarget.id, data })}
          />
        </Modal>
      )}
    </div>
  )
}
