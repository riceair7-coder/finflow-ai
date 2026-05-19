import React, { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { transactionsApi, type TransactionCreate } from '../api/transactions'
import { vendorsApi } from '../api/vendors'
import { departmentsApi } from '../api/departments'
import { STATUS_COLORS, STATUS_LABELS } from '../types'
import { useAuthStore } from '../store/authStore'
import { SearchPanel, type SearchFilters } from '../components/common/SearchPanel'
import { VendorSearchSelect } from '../components/common/VendorSearchSelect'
import { buildDeptPaletteMap, lookupPalette, NEUTRAL } from '../utils/deptColor'
import clsx from 'clsx'

const DEPT_ALL_KEY = '__all__'
const DEPT_UNASSIGNED_KEY = '__unassigned__'

type ImportResult = {
  imported: number
  skipped_duplicate: number
  skipped_invalid: number
  total_in_file: number
  summary: {
    buyer_brn: string
    buyer_name: string
    total_amount_sum: number
    supply_amount_sum: number
    tax_amount_sum: number
  }
}

const SOURCE_LABELS: Record<string, string> = {
  card: '카드', bank: '이체', manual: '수동', ocr: 'OCR', hometax: '홈택스',
}

function fmt(n: number) {
  return `₩${n.toLocaleString('ko-KR')}`
}

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

export function TransactionsPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const initialUser = useAuthStore.getState().user
  const isAdmin = useAuthStore(s => s.user?.role === 'admin')
  const [deptTab, setDeptTab] = useState<string>(
    initialUser && initialUser.role !== 'admin' && initialUser.department_id
      ? initialUser.department_id
      : DEPT_ALL_KEY
  )
  const [showAdd, setShowAdd] = useState(false)
  // 거래 등록 모달 default — 로그인 사용자의 부서를 미리 채움
  const makeInitialForm = (): TransactionCreate => ({
    transaction_date: new Date().toISOString().slice(0, 10),
    amount: 0,
    description: '',
    source: 'manual',
    department_id: initialUser?.department_id ?? undefined,
  })
  const [form, setForm] = useState<TransactionCreate>(makeInitialForm())
  const [vatExempt, setVatExempt] = useState(false)
  const [showNewVendor, setShowNewVendor] = useState(false)
  const [newVendor, setNewVendor] = useState({
    business_registration_no: '',
    name: '',
    representative: '',
    department_id: initialUser?.department_id ?? '',
  })
  // 모달 열 때마다 form/부가세면제 초기화
  const openAddModal = () => {
    setForm(makeInitialForm())
    setVatExempt(false)
    setShowNewVendor(false)
    setNewVendor({
      business_registration_no: '',
      name: '',
      representative: '',
      department_id: initialUser?.department_id ?? '',
    })
    setShowAdd(true)
  }

  const createVendorMutation = useMutation({
    mutationFn: (body: typeof newVendor) => vendorsApi.create({
      business_registration_no: body.business_registration_no.replace(/\D/g, ''),
      name: body.name.trim(),
      representative: body.representative.trim() || undefined,
      department_id: body.department_id || undefined,
    }),
    onSuccess: (res) => {
      const v = res.data.data
      qc.invalidateQueries({ queryKey: ['vendors-all'] })
      qc.invalidateQueries({ queryKey: ['vendors'] })
      // 등록된 공급자가 거래 form에 즉시 선택되도록
      setForm(prev => ({
        ...prev,
        vendor_id: v.id,
        department_id: v.department_id ?? prev.department_id,
      }))
      setShowNewVendor(false)
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '공급자 등록 실패'),
  })

  // 매입 세금계산서 엑셀 업로드
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [search, setSearch] = useState<SearchFilters>({})
  const [viewFilter, setViewFilter] = useState<'unprocessed' | 'settled' | 'prepaid' | 'all'>('unprocessed')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', page, statusFilter, deptTab, search, viewFilter],
    queryFn: () => transactionsApi.list({
      page, limit: 20,
      status: statusFilter || undefined,
      unassigned: deptTab === DEPT_UNASSIGNED_KEY ? true : undefined,
      department_id: deptTab !== DEPT_ALL_KEY && deptTab !== DEPT_UNASSIGNED_KEY ? deptTab : undefined,
      view: viewFilter,
      ...search,
    }),
  })
  const { data: vendorData } = useQuery({ queryKey: ['vendors-all'], queryFn: () => vendorsApi.list({ limit: 200 }) })
  const { data: deptData } = useQuery({ queryKey: ['departments'], queryFn: () => departmentsApi.list({ is_active: true }) })
  const { data: deptCountsData } = useQuery({
    queryKey: ['transactions-dept-counts'],
    queryFn: () => transactionsApi.departmentCounts(),
  })

  const vendors = vendorData?.data.data ?? []
  const departments = deptData?.data.data ?? []
  const vendorMap = Object.fromEntries(vendors.map(v => [v.id, v]))
  const deptMap = Object.fromEntries(departments.map(d => [d.id, d]))
  const paletteMap = buildDeptPaletteMap(departments)

  const transactions = data?.data.data ?? []
  const meta = data?.data.meta

  const createMutation = useMutation({
    mutationFn: transactionsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); setShowAdd(false) },
  })
  const bulkMutation = useMutation({
    mutationFn: transactionsApi.bulkClassify,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })

  const setPrepaidMutation = useMutation({
    mutationFn: (vars: { tx_ids: string[]; is_prepaid: boolean; paid_at?: string }) => transactionsApi.bulkSetPrepaid(vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['transactions-dept-counts'] })
      qc.invalidateQueries({ queryKey: ['unsettled-by-vendor'] })
      setSelected(new Set())
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '사전입금 상태 변경 실패'),
  })

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => transactionsApi.bulkDelete(ids),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['transactions-dept-counts'] })
      qc.invalidateQueries({ queryKey: ['unsettled-by-vendor'] })
      setSelected(new Set())
      alert(`${res.data.data.deleted}건 삭제됨`)
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '삭제 실패'),
  })

  const assignDeptMutation = useMutation({
    mutationFn: (vars: { tx_ids: string[]; department_id: string | null }) =>
      transactionsApi.bulkAssignDepartment(vars),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['transactions-dept-counts'] })
      qc.invalidateQueries({ queryKey: ['vendors-all'] })
      qc.invalidateQueries({ queryKey: ['vendors'] })
      setSelected(new Set())
      const { updated, vendors_updated } = res.data.data
      const vendorMsg = vendors_updated > 0 ? `\n공급자 ${vendors_updated}곳의 담당 부서도 자동 갱신되었습니다.` : ''
      alert(`${updated}건의 부서가 변경되었습니다.${vendorMsg}`)
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '부서 배정 실패'),
  })

  const importMutation = useMutation({
    mutationFn: (file: File) => transactionsApi.importTaxInvoice(file),
    onSuccess: (res) => {
      setImportError(null)
      setImportResult(res.data.data)
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['transactions-dept-counts'] })
      qc.invalidateQueries({ queryKey: ['vendors-all'] })
      qc.invalidateQueries({ queryKey: ['unsettled-by-vendor'] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? '업로드 실패'
      setImportError(typeof msg === 'string' ? msg : JSON.stringify(msg))
      setImportResult(null)
    },
  })

  const set = (k: keyof TransactionCreate) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">거래 내역</h2>
          <p className="mt-0.5 text-sm text-gray-400">사업자번호 기반 자동 분류 · 수동 입력 지원</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => bulkMutation.mutate()}
            disabled={bulkMutation.isPending}
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {bulkMutation.isPending ? '분류 중...' : '🤖 일괄 자동분류'}
          </button>
          <button
            onClick={openAddModal}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            + 거래 등록
          </button>
        </div>
      </div>

      {/* 매입 전자세금계산서 엑셀 업로드 — admin(재무팀) 전용 */}
      {isAdmin && (
      <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">매입 전자세금계산서 엑셀 업로드</h3>
            <p className="mt-1 text-xs text-gray-500">
              홈택스 &gt; 매입 전자(수정) 세금계산서 목록조회에서 다운로드한 .xls 파일을 업로드하면 거래내역에 자동 등록됩니다.
              공급자는 사업자번호로 자동 매칭/생성되며, 같은 승인번호는 재업로드해도 중복 등록되지 않습니다.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setSelectedFile(f)
              setImportError(null)
              setImportResult(null)
            }}
            className="block max-w-md text-xs text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-2 file:text-xs file:font-medium file:text-blue-700 file:shadow-sm hover:file:bg-blue-100"
          />
          <button
            onClick={() => selectedFile && importMutation.mutate(selectedFile)}
            disabled={!selectedFile || importMutation.isPending}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importMutation.isPending ? '파싱 중...' : '파싱 실행'}
          </button>
          {selectedFile && (
            <span className="truncate text-xs text-gray-500">선택됨: {selectedFile.name}</span>
          )}
        </div>

        {importError && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {importError}
          </div>
        )}

        {importResult && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-xs">
            <p className="font-medium text-emerald-700">
              ✓ {importResult.imported}건 등록 완료
              {importResult.skipped_duplicate > 0 && ` · 중복 ${importResult.skipped_duplicate}건 skip`}
              {importResult.skipped_invalid > 0 && ` · 형식오류 ${importResult.skipped_invalid}건 skip`}
              {' '}(파일 내 {importResult.total_in_file}건)
            </p>
            <p className="mt-1 text-gray-500">
              공급받는자: <span className="font-medium text-gray-700">{importResult.summary.buyer_name}</span>
              {' '}({importResult.summary.buyer_brn}) · 총 합계 {fmt(importResult.summary.total_amount_sum)}
              {' '}(공급가액 {fmt(importResult.summary.supply_amount_sum)} + 세액 {fmt(importResult.summary.tax_amount_sum)})
            </p>
          </div>
        )}
      </div>
      )}

      {/* 필터 */}
      <div className="flex flex-wrap gap-3">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm focus:border-blue-400 focus:outline-none">
          <option value="">전체 상태</option>
          <option value="pending">대기중</option>
          <option value="classified">분류완료</option>
          <option value="approved">승인됨</option>
          <option value="rejected">반려됨</option>
        </select>
        <select value={viewFilter} onChange={e => { setViewFilter(e.target.value as any); setPage(1) }}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm focus:border-blue-400 focus:outline-none">
          <option value="unprocessed">미처리 거래만 (기본)</option>
          <option value="settled">정산 묶임</option>
          <option value="prepaid">사전입금</option>
          <option value="all">전체</option>
        </select>
      </div>

      <SearchPanel
        vendors={vendors}
        applied={search}
        onApply={(f) => { setSearch(f); setPage(1) }}
        dateLabel="작성일자"
        searchPlaceholder="품목명/승인번호 검색..."
      />

      {/* 부서 탭 (member는 본인 부서만, admin은 전체/미배정/모든 부서) */}
      <div className="border-b border-gray-200">
        <div className="flex flex-wrap gap-1 -mb-px">
          {(() => {
            const counts = deptCountsData?.data.data
            const me = useAuthStore.getState().user
            const isAdmin = me?.role === 'admin'

            let deptTabs: { key: string; label: string; count: number; deptKey?: string }[]
            if (isAdmin) {
              deptTabs = [
                { key: DEPT_ALL_KEY,        label: '전체',   count: counts?.total ?? 0 },
                { key: DEPT_UNASSIGNED_KEY, label: '미배정', count: counts?.unassigned ?? 0 },
                ...departments.map(d => ({
                  key: d.id,
                  label: `${d.name} (${d.code})`,
                  count: counts?.by_department?.[d.id] ?? 0,
                  deptKey: d.code || d.id,
                })),
              ]
            } else if (me?.department_id) {
              const myDept = departments.find(d => d.id === me.department_id)
              deptTabs = [{
                key: me.department_id,
                label: myDept ? `${myDept.name} (${myDept.code})` : '내 부서',
                count: counts?.by_department?.[me.department_id] ?? counts?.total ?? 0,
                deptKey: myDept ? (myDept.code || myDept.id) : undefined,
              }]
            } else {
              deptTabs = []
            }
            return deptTabs.map(t => {
              const active = t.key === deptTab
              const palette = t.deptKey ? lookupPalette(paletteMap, t.deptKey) : NEUTRAL
              return (
                <button
                  key={t.key}
                  onClick={() => { setDeptTab(t.key); setPage(1) }}
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
                  )}>{t.count}</span>
                </button>
              )
            })
          })()}
        </div>
      </div>

      {/* 사전입금/정산대상 일괄 변경 액션바 — 선택된 거래가 있을 때 */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-3 shadow-sm">
          <span className="text-sm font-medium text-amber-800">{selected.size}건 선택됨</span>
          <span className="text-gray-300">|</span>
          <span className="text-xs text-gray-600">선택한 거래를 변경:</span>
          <button
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10)
              const input = prompt(
                `선택한 ${selected.size}건을 사전입금으로 표시합니다.\n결제완료일을 입력하세요 (YYYY-MM-DD):`,
                today,
              )
              if (input === null) return
              const date = input.trim() || today
              if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { alert('날짜 형식 오류'); return }
              setPrepaidMutation.mutate({ tx_ids: Array.from(selected), is_prepaid: true, paid_at: date })
            }}
            disabled={setPrepaidMutation.isPending}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            사전입금으로 표시
          </button>
          <button
            onClick={() => {
              if (confirm(`선택한 ${selected.size}건을 정산대상으로 되돌립니다.`)) {
                setPrepaidMutation.mutate({ tx_ids: Array.from(selected), is_prepaid: false })
              }
            }}
            disabled={setPrepaidMutation.isPending}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            정산대상으로 변경
          </button>
          <button
            onClick={() => {
              if (confirm(`선택한 ${selected.size}건의 거래를 영구 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?`)) {
                deleteMutation.mutate(Array.from(selected))
              }
            }}
            disabled={deleteMutation.isPending}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            삭제
          </button>
          {isAdmin && (
            <>
              <span className="text-gray-300">|</span>
              <span className="text-xs text-gray-600">담당 부서 배정:</span>
              <select
                value=""
                disabled={assignDeptMutation.isPending}
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) return
                  const dept_id = v === '__unassigned__' ? null : v
                  const label = v === '__unassigned__' ? '미배정' : (deptMap[v]?.name ?? '선택 부서')
                  if (!confirm(`선택한 ${selected.size}건을 "${label}"(으)로 배정합니다.`)) {
                    e.target.value = ''
                    return
                  }
                  assignDeptMutation.mutate({ tx_ids: Array.from(selected), department_id: dept_id })
                  e.target.value = ''
                }}
                className="rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs text-purple-700 hover:bg-purple-50 disabled:opacity-50"
              >
                <option value="">부서 선택...</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
                <option value="__unassigned__">미배정으로 되돌리기</option>
              </select>
            </>
          )}
          <button onClick={() => setSelected(new Set())} className="ml-auto rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-white">선택 해제</button>
        </div>
      )}

      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
       <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={transactions.length > 0 && transactions.every(t => selected.has(t.id))}
                  onChange={() => {
                    const all = transactions.every(t => selected.has(t.id))
                    setSelected(prev => {
                      const next = new Set(prev)
                      if (all) transactions.forEach(t => next.delete(t.id))
                      else transactions.forEach(t => next.add(t.id))
                      return next
                    })
                  }}
                  className="h-4 w-4 cursor-pointer"
                />
              </th>
              <th className="px-4 py-3">날짜</th>
              <th className="px-4 py-3">승인번호</th>
              <th className="px-4 py-3">설명</th>
              <th className="px-4 py-3">공급자</th>
              <th className="px-4 py-3">부서</th>
              <th className="px-4 py-3 text-right">공급가액</th>
              <th className="px-4 py-3 text-right">세액</th>
              <th className="px-4 py-3 text-right">합계금액</th>
              <th className="px-4 py-3">사전입금</th>
              <th className="px-4 py-3">출처</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">신뢰도</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 13 }).map((_, j) => (
                    <td key={j} className="px-4 py-3.5"><div className="h-4 animate-pulse rounded bg-gray-100" /></td>
                  ))}</tr>
                ))
              : transactions.map(tx => {
                  const vendor = tx.vendor_id ? vendorMap[tx.vendor_id] : null
                  const dept = tx.department_id ? deptMap[tx.department_id] : null
                  const isChecked = selected.has(tx.id)
                  return (
                    <tr key={tx.id} className={clsx('hover:bg-gray-50 transition-colors', isChecked && 'bg-blue-50/30', tx.is_prepaid && 'bg-amber-50/30')}>
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelected(prev => {
                              const next = new Set(prev)
                              if (next.has(tx.id)) next.delete(tx.id); else next.add(tx.id)
                              return next
                            })
                          }}
                          className="h-4 w-4 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">{tx.transaction_date}</td>
                      <td className="px-4 py-3.5">
                        {tx.external_id ? (
                          <span
                            className="block max-w-[160px] truncate font-mono text-xs text-gray-500"
                            title={tx.external_id}
                          >
                            {tx.external_id}
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3.5 max-w-xs">
                        <span className="block truncate text-gray-900">{tx.description ?? '-'}</span>
                        {tx.account_code && <span className="text-xs text-gray-400">계정: {tx.account_code}</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {vendor
                          ? <div><p className="font-medium text-gray-900 text-xs">{vendor.name}</p>
                              <p className="text-xs text-gray-400 font-mono">{vendor.business_registration_no}</p></div>
                          : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        {dept ? (() => {
                          const palette = lookupPalette(paletteMap, dept.code || dept.id)
                          return (
                            <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium', palette.badge)}>
                              <span className={clsx('h-1.5 w-1.5 rounded-full', palette.dot)} />
                              {dept.name}
                            </span>
                          )
                        })() : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs text-gray-600 whitespace-nowrap">
                        {tx.supply_amount != null ? fmt(Number(tx.supply_amount)) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs text-gray-600 whitespace-nowrap">
                        {tx.tax_amount != null ? fmt(Number(tx.tax_amount)) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-gray-900 whitespace-nowrap">{fmt(tx.amount)}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col items-start gap-0.5">
                          <button
                            onClick={() => {
                              if (!tx.is_prepaid) {
                                // 사전입금으로 전환 — 오늘 날짜로 paid_at 설정
                                setPrepaidMutation.mutate({ tx_ids: [tx.id], is_prepaid: true, paid_at: new Date().toISOString().slice(0, 10) })
                              } else {
                                setPrepaidMutation.mutate({ tx_ids: [tx.id], is_prepaid: false })
                              }
                            }}
                            disabled={setPrepaidMutation.isPending}
                            className={clsx(
                              'rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
                              tx.is_prepaid
                                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-700',
                            )}
                            title="클릭하여 사전입금/정산대상 전환"
                          >
                            {tx.is_prepaid ? '✓ 사전입금' : '정산대상'}
                          </button>
                          {tx.is_prepaid && tx.paid_at && (
                            <span className="text-[10px] text-amber-700">{tx.paid_at.slice(0, 10)}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{SOURCE_LABELS[tx.source] ?? tx.source}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[tx.status])}>
                          {STATUS_LABELS[tx.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {tx.ai_classification_confidence != null ? (
                          <span className={clsx('text-xs font-semibold',
                            tx.ai_classification_confidence >= 0.9 ? 'text-emerald-600' :
                            tx.ai_classification_confidence >= 0.7 ? 'text-amber-600' : 'text-rose-600')}>
                            {(tx.ai_classification_confidence * 100).toFixed(0)}%
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
       </div>

        {meta && meta.pages > 1 && (
          <div className="flex items-center justify-between border-t px-5 py-3">
            <p className="text-xs text-gray-400">총 {meta.total}건</p>
            <div className="flex gap-1">
              {Array.from({ length: meta.pages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  className={clsx('h-7 w-7 rounded-lg text-xs', p === page ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100')}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="거래 등록" onClose={() => setShowAdd(false)}>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">작성일자 *</label>
                <input type="date" value={form.transaction_date} onChange={set('transaction_date')}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">승인번호</label>
                <input value={form.external_id ?? ''} onChange={set('external_id')}
                  placeholder="홈택스 승인번호 (선택)"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-gray-600">공급자 *</label>
                <button
                  type="button"
                  onClick={() => setShowNewVendor(!showNewVendor)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {showNewVendor ? '× 취소' : '+ 새 공급자 등록'}
                </button>
              </div>

              {!showNewVendor && (
                <VendorSearchSelect
                  vendors={vendors}
                  value={form.vendor_id}
                  onChange={v => {
                    setForm(prev => ({
                      ...prev,
                      vendor_id: v?.id,
                      department_id: v?.department_id ?? prev.department_id,
                    }))
                  }}
                />
              )}

              {showNewVendor && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
                  <p className="text-xs text-blue-800 font-medium">신규 공급자 등록 (최소 정보)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newVendor.business_registration_no}
                      onChange={e => setNewVendor(p => ({ ...p, business_registration_no: e.target.value }))}
                      placeholder="사업자등록번호 (000-00-00000)"
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-mono focus:border-blue-400 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={newVendor.name}
                      onChange={e => setNewVendor(p => ({ ...p, name: e.target.value }))}
                      placeholder="공급자명"
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={newVendor.representative}
                      onChange={e => setNewVendor(p => ({ ...p, representative: e.target.value }))}
                      placeholder="대표자명"
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    />
                    <select
                      value={newVendor.department_id}
                      onChange={e => setNewVendor(p => ({ ...p, department_id: e.target.value }))}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    >
                      <option value="">담당 부서 (선택)</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <p className="text-xs text-gray-400">계좌·주소 등 상세 정보는 공급자 관리에서 추후 보완 가능.</p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => createVendorMutation.mutate(newVendor)}
                      disabled={
                        createVendorMutation.isPending ||
                        !newVendor.name.trim() ||
                        newVendor.business_registration_no.replace(/\D/g, '').length !== 10
                      }
                      className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {createVendorMutation.isPending ? '등록 중...' : '공급자 등록 + 선택'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">공급가액 (원)</label>
                <input
                  type="number"
                  value={form.supply_amount ?? ''}
                  onChange={e => {
                    const supply = e.target.value === '' ? undefined : Number(e.target.value)
                    setForm(prev => {
                      const rate = vatExempt ? 0 : 0.1
                      const tax = supply !== undefined ? Math.floor(supply * rate) : prev.tax_amount
                      const total = supply !== undefined ? supply + (tax ?? 0) : prev.amount
                      return { ...prev, supply_amount: supply, tax_amount: tax, amount: total }
                    })
                  }}
                  placeholder="0"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-right focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">세액 (원)</label>
                <input
                  type="number"
                  value={form.tax_amount ?? ''}
                  onChange={e => {
                    const tax = e.target.value === '' ? undefined : Number(e.target.value)
                    setForm(prev => ({ ...prev, tax_amount: tax, amount: (prev.supply_amount ?? 0) + (tax ?? 0) }))
                  }}
                  placeholder="공급가액 입력 시 자동"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-right focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">합계금액 (원) *</label>
                <input
                  type="number"
                  value={form.amount || ''}
                  onChange={e => setForm(prev => ({ ...prev, amount: Number(e.target.value) }))}
                  placeholder="0"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-right font-semibold focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
            <div className="flex items-center justify-between -mt-2">
              <p className="text-xs text-gray-400">
                공급가액 입력 시 세액({vatExempt ? '면제' : '10%'})과 합계금액이 자동 계산됩니다. 필요시 직접 수정 가능.
              </p>
              <label className="flex items-center gap-1.5 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={vatExempt}
                  onChange={e => {
                    const ex = e.target.checked
                    setVatExempt(ex)
                    // 즉시 적용: 현재 공급가액 기준 재계산
                    setForm(prev => {
                      const supply = prev.supply_amount
                      const rate = ex ? 0 : 0.1
                      const tax = supply !== undefined ? Math.floor(supply * rate) : 0
                      const total = supply !== undefined ? supply + tax : prev.amount
                      return { ...prev, tax_amount: tax, amount: total }
                    })
                  }}
                  className="h-3.5 w-3.5 cursor-pointer"
                />
                <span><b>부가세 면제</b> (세액 0)</span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">품목명 / 설명</label>
              <input value={form.description ?? ''} onChange={set('description')}
                placeholder="예: 액자 외 0건"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">담당 부서</label>
                <select value={form.department_id ?? ''} onChange={set('department_id')}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none">
                  <option value="">미배정</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <p className="mt-1 text-xs text-gray-400">공급자 선택 시 자동 채워짐</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">입력 방식</label>
                <select value={form.source ?? 'manual'} onChange={set('source')}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none">
                  <option value="manual">수동</option>
                  <option value="card">카드</option>
                  <option value="bank">이체</option>
                  <option value="ocr">OCR</option>
                  <option value="hometax">홈택스</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={!!form.is_prepaid}
                  onChange={e => {
                    const checked = e.target.checked
                    setForm(prev => ({
                      ...prev,
                      is_prepaid: checked,
                      paid_at: checked ? (prev.paid_at ?? new Date().toISOString().slice(0, 10)) : undefined,
                    }))
                  }}
                  className="h-4 w-4 cursor-pointer"
                />
                <span>
                  <b className="text-amber-700">사전입금</b>(이미 결제 완료)으로 등록
                  <span className="ml-1 text-gray-400">— 정산/청구서 단계 제외</span>
                </span>
              </label>
              {form.is_prepaid && (
                <div className="ml-6 flex items-center gap-2 text-xs">
                  <label className="text-gray-600">결제완료일:</label>
                  <input
                    type="date"
                    value={form.paid_at ?? ''}
                    onChange={e => setForm(prev => ({ ...prev, paid_at: e.target.value || undefined }))}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button onClick={() => setShowAdd(false)} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">취소</button>
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.amount || !form.vendor_id}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? '등록 중...' : '등록'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
