import React, { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { vendorsApi, type Vendor, type VendorCreate } from '../api/vendors'
import { departmentsApi, type Department } from '../api/departments'
import { buildDeptPaletteMap, lookupPalette, NEUTRAL } from '../utils/deptColor'
import clsx from 'clsx'

const UNASSIGNED_KEY = '__unassigned__'
const ALL_KEY = '__all__'

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
    bank_info: defaultValues?.bank_info ?? { bank_name: '', account_no: '', holder: '' },
  })

  const set = (k: keyof VendorCreate) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  const setBank = (k: 'bank_name' | 'account_no' | 'holder') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({
      ...prev,
      bank_info: { ...(prev.bank_info ?? {}), [k]: e.target.value },
    }))

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

        {/* 결제 계좌 정보 */}
        <div className="col-span-2 mt-2 rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-600">결제 계좌 (재무팀 결제 진행용)</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">은행명</label>
              <input
                value={form.bank_info?.bank_name ?? ''}
                onChange={setBank('bank_name')}
                placeholder="국민은행"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">계좌번호</label>
              <input
                value={form.bank_info?.account_no ?? ''}
                onChange={setBank('account_no')}
                placeholder="000-00-000000"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">예금주</label>
              <input
                value={form.bank_info?.holder ?? ''}
                onChange={setBank('holder')}
                placeholder="공급자명"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>
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
  const [activeTab, setActiveTab] = useState<string>(ALL_KEY)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState<Vendor | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeptValue, setBulkDeptValue] = useState<string>('')
  const [applyToExistingTx, setApplyToExistingTx] = useState(false)
  const [lastResult, setLastResult] = useState<{ vendors: number; transactions: number; deptLabel: string } | null>(null)

  const { data: deptData } = useQuery({ queryKey: ['departments'], queryFn: () => departmentsApi.list({ is_active: true }) })
  const departments = deptData?.data.data ?? []

  // 탭 전환을 위해 전체를 한 번에 받아 클라이언트에서 그룹화/필터
  const { data, isLoading } = useQuery({
    queryKey: ['vendors', 'all', search],
    queryFn: () => vendorsApi.list({ search: search || undefined, limit: 200 }),
  })
  const allVendors = data?.data.data ?? []

  const deptMap = useMemo(() => Object.fromEntries(departments.map(d => [d.id, d])), [departments])
  const paletteMap = useMemo(() => buildDeptPaletteMap(departments), [departments])

  // 탭별 카운트
  const counts = useMemo(() => {
    const c: Record<string, number> = { [ALL_KEY]: allVendors.length, [UNASSIGNED_KEY]: 0 }
    for (const d of departments) c[d.id] = 0
    for (const v of allVendors) {
      if (!v.department_id || !deptMap[v.department_id]) c[UNASSIGNED_KEY]++
      else c[v.department_id] = (c[v.department_id] ?? 0) + 1
    }
    return c
  }, [allVendors, departments, deptMap])

  // 현재 탭에 해당하는 vendor만
  const visibleVendors = useMemo(() => {
    if (activeTab === ALL_KEY) return allVendors
    if (activeTab === UNASSIGNED_KEY) return allVendors.filter(v => !v.department_id || !deptMap[v.department_id])
    return allVendors.filter(v => v.department_id === activeTab)
  }, [allVendors, activeTab, deptMap])

  const visibleIds = useMemo(() => visibleVendors.map(v => v.id), [visibleVendors])
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => selected.has(id))
  const someChecked = visibleIds.some(id => selected.has(id)) && !allChecked

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleAllVisible = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allChecked) visibleIds.forEach(id => next.delete(id))
      else visibleIds.forEach(id => next.add(id))
      return next
    })
  }
  const clearSelection = () => setSelected(new Set())

  // 탭 전환 시 선택 초기화 (혼란 방지)
  const changeTab = (key: string) => {
    setActiveTab(key)
    clearSelection()
  }

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
  const bulkAssignMutation = useMutation({
    mutationFn: (vars: { department_id: string | null; deptLabel: string }) =>
      vendorsApi.bulkAssignDepartment({
        vendor_ids: Array.from(selected),
        department_id: vars.department_id,
        apply_to_existing_transactions: applyToExistingTx,
      }).then(res => ({ res, deptLabel: vars.deptLabel })),
    onSuccess: ({ res, deptLabel }) => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['transactions-dept-counts'] })
      setLastResult({
        vendors: res.data.data.updated,
        transactions: res.data.data.transactions_updated,
        deptLabel,
      })
      clearSelection()
      setBulkDeptValue('')
    },
  })

  const applyBulkAssign = () => {
    if (selected.size === 0) return
    const target = bulkDeptValue === '' ? null : bulkDeptValue
    const label = target === null
      ? '미배정 (부서 해제)'
      : `${deptMap[target]?.name ?? '선택한 부서'} (${deptMap[target]?.code ?? ''})`
    const extra = applyToExistingTx
      ? '\n⚠ 해당 공급자들의 기존 거래도 모두 같은 부서로 덮어씁니다.'
      : ''
    if (!confirm(`선택한 ${selected.size}곳의 부서를 [${label}]로 변경합니다.${extra}\n계속할까요?`)) return
    bulkAssignMutation.mutate({ department_id: target, deptLabel: label })
  }

  const tabs: { key: string; label: string; deptKey?: string }[] = [
    { key: ALL_KEY,        label: '전체' },
    { key: UNASSIGNED_KEY, label: '미배정' },
    ...departments.map(d => ({ key: d.id, label: `${d.name} (${d.code})`, deptKey: d.code || d.id })),
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">공급자 관리</h2>
          <p className="mt-0.5 text-sm text-gray-400">탭별로 공급자를 확인하고, 체크박스로 선택해 부서를 일괄 지정할 수 있습니다.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          <span className="text-base">+</span> 공급자 등록
        </button>
      </div>

      {/* 검색 */}
      <div>
        <input
          value={search} onChange={e => { setSearch(e.target.value); clearSelection() }}
          placeholder="공급자명 또는 사업자번호 검색..."
          className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200">
        <div className="flex flex-wrap gap-1 -mb-px">
          {tabs.map(t => {
            const active = t.key === activeTab
            const count = counts[t.key] ?? 0
            const palette = t.deptKey ? lookupPalette(paletteMap, t.deptKey) : NEUTRAL
            return (
              <button
                key={t.key}
                onClick={() => changeTab(t.key)}
                className={clsx(
                  'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? palette.tabActive
                    : 'border-transparent text-gray-500 hover:text-gray-800',
                )}
              >
                {t.deptKey && <span className={clsx('h-2 w-2 rounded-full', palette.dot)} />}
                {t.label}
                <span className={clsx(
                  'rounded-full px-2 py-0.5 text-xs',
                  active ? palette.badge : 'bg-gray-100 text-gray-500',
                )}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 일괄 액션 바 */}
      {selected.size > 0 && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 px-5 py-3 shadow-sm space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-blue-700">{selected.size}곳 선택됨</span>
            <span className="text-gray-300">|</span>
            <span className="text-xs text-gray-600">부서 일괄 지정:</span>
            <select
              value={bulkDeptValue}
              onChange={e => setBulkDeptValue(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            >
              <option value="">— 미배정 —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
            </select>
            <button
              onClick={applyBulkAssign}
              disabled={bulkAssignMutation.isPending}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {bulkAssignMutation.isPending ? '적용 중...' : '적용'}
            </button>
            <button
              onClick={clearSelection}
              className="ml-auto rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-white"
            >
              선택 해제
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={applyToExistingTx}
              onChange={e => setApplyToExistingTx(e.target.checked)}
              className="h-4 w-4 cursor-pointer"
            />
            <span>
              이 공급자들의 <b className="text-gray-900">기존 거래</b>에도 같은 부서를 적용
              <span className="ml-1 text-gray-400">(미체크 시 신규 거래에만 적용됩니다)</span>
            </span>
          </label>
        </div>
      )}

      {/* 결과 토스트 */}
      {lastResult && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-3">
          <span className="mt-0.5 text-emerald-600">✓</span>
          <div className="flex-1 text-sm">
            <p className="font-medium text-emerald-700">
              공급자 {lastResult.vendors}곳 → [{lastResult.deptLabel}] 부서 적용 완료
            </p>
            {lastResult.transactions > 0 ? (
              <p className="mt-0.5 text-xs text-gray-600">
                기존 거래 {lastResult.transactions}건도 함께 부서가 변경되었습니다.
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-gray-500">
                (기존 거래 반영 옵션은 적용되지 않았거나, 변경할 거래가 없었습니다.)
              </p>
            )}
          </div>
          <button
            onClick={() => setLastResult(null)}
            className="rounded-lg p-1 text-gray-400 hover:bg-white"
          >✕</button>
        </div>
      )}

      {/* 목록 */}
      {isLoading ? (
        <div className="space-y-4">
          {[1,2].map(i => <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      ) : visibleVendors.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-16">
          <span className="text-4xl">🏢</span>
          <p className="mt-3 text-sm font-medium text-gray-500">
            {activeTab === ALL_KEY ? '등록된 공급자가 없습니다' : '해당 탭에 공급자가 없습니다'}
          </p>
          {activeTab === ALL_KEY && (
            <button onClick={() => setShowAdd(true)} className="mt-4 text-sm text-blue-600 hover:underline">첫 공급자 등록하기</button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked }}
                    onChange={toggleAllVisible}
                    className="h-4 w-4 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3">공급자명</th>
                <th className="px-4 py-3">사업자번호</th>
                <th className="px-4 py-3">담당 부서</th>
                <th className="px-4 py-3">대표자</th>
                <th className="px-4 py-3">연락처</th>
                <th className="px-4 py-3">결제조건</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibleVendors.map(v => {
                const dept = v.department_id ? deptMap[v.department_id] : null
                const isChecked = selected.has(v.id)
                return (
                  <tr key={v.id} className={clsx('hover:bg-gray-50 transition-colors', isChecked && 'bg-blue-50/40')}>
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(v.id)}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3.5 font-medium text-gray-900">{v.name}</td>
                    <td className="px-4 py-3.5 font-mono text-gray-500">{fmtBRN(v.business_registration_no)}</td>
                    <td className="px-4 py-3.5 text-gray-600">
                      {dept
                        ? (() => {
                            const palette = lookupPalette(paletteMap, dept.code || dept.id)
                            return (
                              <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', palette.badge)}>
                                <span className={clsx('h-1.5 w-1.5 rounded-full', palette.dot)} />
                                {dept.name}
                              </span>
                            )
                          })()
                        : <span className="text-xs text-gray-300">미배정</span>}
                    </td>
                    <td className="px-4 py-3.5 text-gray-500">{v.representative ?? '-'}</td>
                    <td className="px-4 py-3.5 text-gray-500">{v.phone ?? v.email ?? '-'}</td>
                    <td className="px-4 py-3.5 text-gray-500">NET {v.payment_terms_days}일</td>
                    <td className="px-4 py-3.5">
                      {v.is_active
                        ? <Badge color="bg-emerald-50 text-emerald-700">활성</Badge>
                        : <Badge color="bg-gray-100 text-gray-500">비활성</Badge>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex gap-2">
                        <button onClick={() => setEditTarget(v)}
                          className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">수정</button>
                        <button
                          onClick={() => {
                            if (confirm(`'${v.name}' 공급자를 비활성화하시겠습니까?`)) deleteMutation.mutate(v.id)
                          }}
                          className="rounded-lg border border-red-100 px-3 py-1 text-xs text-red-500 hover:bg-red-50">비활성화</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
