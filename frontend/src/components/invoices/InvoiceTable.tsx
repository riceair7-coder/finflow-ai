import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invoicesApi } from '../../api/invoices'
import { vendorsApi } from '../../api/vendors'
import { departmentsApi } from '../../api/departments'
import { apiClient } from '../../api/client'
import { StatusBadge } from '../common/StatusBadge'
import { useAuthStore } from '../../store/authStore'
import { SearchPanel, type SearchFilters } from '../common/SearchPanel'
import { buildDeptPaletteMap, lookupPalette, NEUTRAL } from '../../utils/deptColor'
import clsx from 'clsx'
import dayjs from 'dayjs'

const DEPT_ALL_KEY = '__all__'
const DEPT_UNASSIGNED_KEY = '__unassigned__'

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'draft',     label: '발행됨' },
  { key: 'sent',      label: '결제 대기' },
  { key: 'paid',      label: '결제완료' },
  { key: 'cancelled', label: '취소' },
  { key: '',          label: '전체' },
]

function formatKRW(n: number) { return `₩${n.toLocaleString('ko-KR')}` }

/** 엑셀 다운로드에 그대로 넘길, 현재 목록에 적용 중인 필터 */
export interface InvoiceExportFilters {
  status?: string
  department_id?: string
  unassigned?: boolean
  date_from?: string
  date_to?: string
  amount_min?: number
  amount_max?: number
  vendor_id?: string
  search?: string
}

export function InvoiceTable({ onFiltersChange }: { onFiltersChange?: (f: InvoiceExportFilters) => void }) {
  const qc = useQueryClient()
  const initialUser = useAuthStore.getState().user
  const me = useAuthStore(s => s.user)
  const isAdmin = me?.role === 'admin'
  const [searchParams] = useSearchParams()

  const [page, setPage] = useState(1)
  const [deptTab, setDeptTab] = useState<string>(
    initialUser && initialUser.role !== 'admin' && initialUser.department_id
      ? initialUser.department_id
      : DEPT_ALL_KEY
  )
  const [search, setSearch] = useState<SearchFilters>({})
  const [statusTab, setStatusTab] = useState<string>(searchParams.get('status') ?? 'draft')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // 목록 조회 필터를 그대로 엑셀 다운로드에도 넘긴다 (page/limit만 제외)
  const listFilters = {
    unassigned: deptTab === DEPT_UNASSIGNED_KEY ? true : undefined,
    department_id: deptTab !== DEPT_ALL_KEY && deptTab !== DEPT_UNASSIGNED_KEY ? deptTab : undefined,
    status: statusTab || undefined,
    ...search,
  }

  useEffect(() => {
    onFiltersChange?.(listFilters)
    // listFilters는 매 렌더 새 객체라 원본 상태값으로 의존성을 건다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptTab, statusTab, search, onFiltersChange])

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, deptTab, search, statusTab],
    queryFn: () => invoicesApi.list({ page, limit: 50, ...listFilters }),
  })
  const invoices = data?.data.data ?? []
  const meta = data?.data.meta

  const { data: vendorData } = useQuery({
    queryKey: ['vendors-all'],
    queryFn: () => vendorsApi.list({ limit: 200 }),
  })
  const vendorMap = Object.fromEntries((vendorData?.data.data ?? []).map(v => [v.id, v]))

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentsApi.list({ is_active: true }),
  })
  const departments = deptData?.data.data ?? []
  const deptMap = Object.fromEntries(departments.map(d => [d.id, d]))
  const paletteMap = buildDeptPaletteMap(departments)

  const { data: deptCountsData } = useQuery({
    queryKey: ['invoices-dept-counts'],
    queryFn: () => invoicesApi.departmentCounts(),
  })
  const counts = deptCountsData?.data.data

  const { data: statusCountsData } = useQuery({
    queryKey: ['invoices-status-counts'],
    queryFn: () => invoicesApi.statusCounts(),
  })
  const statusCounts = statusCountsData?.data.data

  const sendMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.send(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoices-dept-counts'] })
      qc.invalidateQueries({ queryKey: ['invoices-status-counts'] })
    },
  })
  const paidMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.markPaid(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoices-dept-counts'] })
      qc.invalidateQueries({ queryKey: ['invoices-status-counts'] })
    },
  })
  const paidDateMutation = useMutation({
    mutationFn: (params: { id: string; paid_at: string }) => invoicesApi.updatePaidDate(params.id, params.paid_at),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoices-status-counts'] })
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '결제완료일 수정 실패'),
  })
  const bulkPayMutation = useMutation({
    mutationFn: (ids: string[]) => invoicesApi.bulkPay(ids),
    onSuccess: (res) => {
      alert(`${res.data.data.updated}건 결제완료 처리됨`)
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoices-status-counts'] })
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '결제 처리 실패'),
  })

  const bulkSendMutation = useMutation({
    mutationFn: (ids: string[]) => invoicesApi.bulkSend(ids),
    onSuccess: (res) => {
      const { updated, skipped_no_account = 0, skipped_vendors = [] } = res.data.data as {
        updated: number; skipped_no_account?: number; skipped_vendors?: string[]
      }
      const skipMsg = skipped_no_account > 0
        ? `\n\n계좌 미등록으로 제외 ${skipped_no_account}건${skipped_vendors.length ? `\n· ${skipped_vendors.join('\n· ')}` : ''}`
        : ''
      alert(`${updated}건 발송 완료${skipMsg}`)
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoices-status-counts'] })
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '발송 실패'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoices-dept-counts'] })
      qc.invalidateQueries({ queryKey: ['invoices-status-counts'] })
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '청구서 반려 실패'),
  })
  const postponeMutation = useMutation({
    mutationFn: (params: { id: string; due_date?: string }) => invoicesApi.postpone(params.id, params.due_date),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoices-dept-counts'] })
      qc.invalidateQueries({ queryKey: ['invoices-status-counts'] })
      alert(`재청구 완료 — 새 만기일 ${res.data.data.due_date}`)
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '재청구 실패'),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoices-dept-counts'] })
      qc.invalidateQueries({ queryKey: ['invoices-status-counts'] })
      qc.invalidateQueries({ queryKey: ['settlements'] })
      qc.invalidateQueries({ queryKey: ['settlements-dept-counts'] })
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '청구서 삭제 실패'),
  })

  const downloadPaymentSheet = async () => {
    if (selected.size === 0) return
    try {
      const ids = Array.from(selected)
      const resp = await apiClient.get(invoicesApi.paymentSheetUrl(ids), { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `payment-sheet-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert('엑셀 다운로드 실패: ' + (e?.message ?? ''))
    }
  }

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

  const visibleSelected = invoices.filter(i => selected.has(i.id))
  const canBulkPay = visibleSelected.length > 0 && visibleSelected.every(
    i => i.status === 'draft' || i.status === 'sent' || i.status === 'overdue'
  )
  // 계좌 미등록 공급자는 발송해도 결제 단계에서 되돌아온다 → 발송 대상에서 제외
  const hasBankAccount = (vendorId: string | null | undefined) =>
    !!(vendorId ? vendorMap[vendorId]?.bank_info?.account_no : null)
  const draftAll = visibleSelected.filter(i => i.status === 'draft')
  const draftSelected = draftAll.filter(i => hasBankAccount(i.vendor_id))
  const draftBlocked = draftAll.filter(i => !hasBankAccount(i.vendor_id))

  return (
    <div className="space-y-4">
      <SearchPanel
        vendors={
          deptTab === DEPT_ALL_KEY
            ? (vendorData?.data.data ?? [])
            : deptTab === DEPT_UNASSIGNED_KEY
              ? (vendorData?.data.data ?? []).filter(v => !v.department_id)
              : (vendorData?.data.data ?? []).filter(v => v.department_id === deptTab)
        }
        applied={search}
        onApply={(f) => { setSearch(f); setPage(1) }}
        dateLabel="발행일"
        searchPlaceholder="청구서번호 검색..."
      />

      {/* 부서 탭 */}
      <div className="border-b border-gray-200">
        <div className="flex flex-wrap gap-1 -mb-px">
          {deptTabs.map(t => {
            const active = t.key === deptTab
            const palette = t.deptKey ? lookupPalette(paletteMap, t.deptKey) : NEUTRAL
            return (
              <button
                key={t.key}
                onClick={() => { setDeptTab(t.key); setPage(1); setSearch(prev => prev.vendor_id ? { ...prev, vendor_id: undefined } : prev) }}
                className={clsx(
                  'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                  active ? palette.tabActive : 'border-transparent text-gray-500 hover:text-gray-800',
                )}
              >
                {t.deptKey && <span className={clsx('h-2 w-2 rounded-full', palette.dot)} />}
                {t.label}
                <span className={clsx('rounded-full px-2 py-0.5 text-xs', active ? palette.badge : 'bg-gray-100 text-gray-500')}>{t.count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 상태 탭 — 카운트 배지 포함 */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map(t => {
          const active = t.key === statusTab
          const count = t.key === ''
            ? statusCounts?.total ?? 0
            : statusCounts?.by_status?.[t.key] ?? 0
          // paid 탭은 강조: 결제완료된 청구서를 모아보는 위치임을 시각적으로
          // sent 탭은 강조: 결제 대기(조치 필요) 청구서를 모아보는 위치임을 시각적으로
          const isPaid = t.key === 'paid'
          const isSent = t.key === 'sent'
          return (
            <button
              key={t.key || 'all'}
              onClick={() => { setStatusTab(t.key); setPage(1); setSelected(new Set()) }}
              className={clsx(
                'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? (isPaid ? 'bg-emerald-600 text-white' : isSent ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white')
                  : (isPaid
                      ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : isSent
                      ? 'border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'),
              )}
            >
              {t.label}
              <span className={clsx(
                'rounded-full px-1.5 py-0.5 text-[10px]',
                active ? 'bg-white/20' : 'bg-white text-gray-500',
              )}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* 결제/발송 액션바 */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/50 px-5 py-3 shadow-sm">
          <span className="text-sm font-medium text-blue-700">{selected.size}건 선택됨</span>
          {draftSelected.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">발송 대상 {draftSelected.length}건</span>
          )}
          {draftBlocked.length > 0 && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-800" title="공급자 관리에서 입금 계좌를 먼저 등록하세요">
              ⚠ 계좌 미등록 {draftBlocked.length}건 제외
            </span>
          )}
          <span className="text-gray-300">|</span>

          {/* 발송 — draft 상태 청구서에 한해 모두에게 노출 */}
          <button
            onClick={() => {
              if (draftSelected.length === 0) return
              if (confirm(`선택 중 draft 상태 ${draftSelected.length}건을 일괄 발송합니다.\n계속할까요?`)) {
                bulkSendMutation.mutate(draftSelected.map(i => i.id))
              }
            }}
            disabled={draftSelected.length === 0 || bulkSendMutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              draftSelected.length === 0
                ? (draftBlocked.length > 0
                    ? '선택한 draft 청구서의 공급자에 입금 계좌가 등록되어 있지 않습니다'
                    : '발송 대상(draft)이 없습니다')
                : ''
            }
          >
            {bulkSendMutation.isPending ? '발송 중...' : `일괄 발송 (${draftSelected.length}건)`}
          </button>

          {/* admin 전용 — 결제 매칭 + 결제완료 */}
          {isAdmin && (
            <>
              <button
                onClick={downloadPaymentSheet}
                className="rounded-lg bg-white border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                📊 결제 매칭 엑셀
              </button>
              <button
                onClick={() => {
                  if (!canBulkPay) return
                  const sum = visibleSelected.reduce((s, i) => s + Number(i.total_amount), 0)
                  if (confirm(`선택한 ${selected.size}건을 결제완료로 처리합니다.\n총 ${formatKRW(sum)}\n계속할까요?`)) {
                    bulkPayMutation.mutate(Array.from(selected))
                  }
                }}
                disabled={!canBulkPay || bulkPayMutation.isPending}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                title={!canBulkPay ? 'paid/cancelled 상태는 처리 불가' : ''}
              >
                {bulkPayMutation.isPending ? '처리 중...' : '결제완료 처리'}
              </button>
            </>
          )}
          <button onClick={() => setSelected(new Set())} className="ml-auto rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-white">선택 해제</button>
        </div>
      )}

      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="border-b bg-gray-50 px-5 py-4">
          <h3 className="font-semibold text-gray-800">청구서 목록</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={(() => {
                      const eligible = invoices.filter(i => i.status === 'draft' || i.status === 'sent' || i.status === 'overdue')
                      return eligible.length > 0 && eligible.every(i => selected.has(i.id))
                    })()}
                    onChange={() => {
                      const eligible = invoices.filter(i => i.status === 'draft' || i.status === 'sent' || i.status === 'overdue')
                      const allSelected = eligible.length > 0 && eligible.every(i => selected.has(i.id))
                      setSelected(prev => {
                        const next = new Set(prev)
                        if (allSelected) eligible.forEach(i => next.delete(i.id))
                        else eligible.forEach(i => next.add(i.id))
                        return next
                      })
                    }}
                    className="h-4 w-4 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3">청구서 번호</th>
                <th className="px-4 py-3">공급자</th>
                <th className="px-4 py-3">담당 부서</th>
                <th className="px-4 py-3">계좌</th>
                <th className="px-4 py-3">청구일자</th>
                <th className="px-4 py-3">결제완료일</th>
                <th className="px-4 py-3 text-right">청구액</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-4"><div className="h-4 animate-pulse rounded bg-gray-100" /></td>
                    ))}</tr>
                  ))
                : invoices.length === 0 ? (
                    <tr><td colSpan={10} className="px-5 py-10 text-center text-sm text-gray-400">해당 탭에 청구서가 없습니다.</td></tr>
                  ) :
                  invoices.map(inv => {
                    const vendor = inv.vendor_id ? vendorMap[inv.vendor_id] : null
                    const dept = inv.department_id ? deptMap[inv.department_id] : null
                    const isChecked = selected.has(inv.id)
                    const bank = vendor?.bank_info ?? null
                    return (
                      <tr key={inv.id} className={clsx('hover:bg-gray-50 transition-colors', isChecked && 'bg-blue-50/40')}>
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={inv.status === 'paid' || inv.status === 'cancelled'}
                            onChange={() => {
                              setSelected(prev => {
                                const next = new Set(prev)
                                if (next.has(inv.id)) next.delete(inv.id); else next.add(inv.id)
                                return next
                              })
                            }}
                            className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                            title={inv.status === 'paid' || inv.status === 'cancelled' ? '결제완료/취소된 청구서는 대상이 아닙니다' : ''}
                          />
                        </td>
                        <td className="px-4 py-4 font-mono text-xs text-gray-500">{inv.invoice_no}</td>
                        <td className="px-4 py-4">
                          {vendor ? (
                            <div>
                              <p className="font-medium text-gray-900 text-xs">{vendor.name}</p>
                              <p className="text-xs text-gray-400 font-mono">{vendor.business_registration_no}</p>
                            </div>
                          ) : <span className="text-gray-400">-</span>}
                        </td>
                        <td className="px-4 py-4">
                          {dept ? (() => {
                            const palette = lookupPalette(paletteMap, dept.code || dept.id)
                            return (
                              <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', palette.badge)}>
                                <span className={clsx('h-1.5 w-1.5 rounded-full', palette.dot)} />
                                {dept.name}
                              </span>
                            )
                          })() : <span className="text-xs text-gray-300">미배정</span>}
                        </td>
                        <td className="px-4 py-4 text-xs">
                          {(() => {
                            const rep = vendor?.representative ?? ''
                            const holder = bank?.holder ?? ''
                            const mismatch = rep && holder && rep.replace(/\s/g, '') !== holder.replace(/\s/g, '')
                            return bank?.account_no ? (
                              <div className={mismatch ? 'rounded bg-amber-50 px-1.5 py-1 -mx-1.5' : ''}>
                                <p className="font-mono text-gray-700">{bank.account_no}</p>
                                <p className="text-gray-500">{bank.bank_name ?? ''} {holder && `· 예금주 ${holder}`}</p>
                                {rep && (
                                  <p className={mismatch ? 'text-amber-700 font-medium' : 'text-gray-400'}>
                                    {mismatch ? '⚠ ' : ''}대표 {rep}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div>
                                <span className="text-rose-500">⚠ 계좌 미등록</span>
                                {rep && <p className="text-gray-400 mt-0.5">대표 {rep}</p>}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-4 text-gray-500 text-xs">{inv.issue_date}</td>
                        <td className="px-4 py-4 text-xs">
                          {isAdmin && inv.status !== 'cancelled' ? (
                            <button
                              onClick={() => {
                                const cur = inv.paid_at ? inv.paid_at.slice(0, 10) : dayjs().format('YYYY-MM-DD')
                                const input = prompt(
                                  `청구서 ${inv.invoice_no}\n결제완료일 (YYYY-MM-DD):`,
                                  cur,
                                )
                                if (input === null) return
                                const trimmed = input.trim()
                                if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                                  alert('날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)')
                                  return
                                }
                                paidDateMutation.mutate({ id: inv.id, paid_at: trimmed })
                              }}
                              disabled={paidDateMutation.isPending}
                              className={clsx(
                                'rounded px-1.5 py-0.5 text-left hover:bg-emerald-50',
                                inv.paid_at ? 'text-emerald-700 font-medium' : 'text-gray-400 italic',
                              )}
                              title="클릭하여 결제완료일 수정"
                            >
                              {inv.paid_at ? inv.paid_at.slice(0, 10) : '입력'}
                            </button>
                          ) : (
                            <span className={inv.paid_at ? 'text-emerald-700' : 'text-gray-300'}>
                              {inv.paid_at ? inv.paid_at.slice(0, 10) : '-'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-gray-900 whitespace-nowrap">{formatKRW(inv.total_amount)}</td>
                        <td className="px-4 py-4"><StatusBadge status={inv.status} /></td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {inv.status === 'draft' && (() => {
                              const noAccount = !bank?.account_no
                              return (
                                <button
                                  onClick={() => sendMutation.mutate(inv.id)}
                                  disabled={sendMutation.isPending || noAccount}
                                  title={noAccount ? '입금 계좌가 등록되지 않아 발송할 수 없습니다 — 공급자 관리에서 계좌를 먼저 등록하세요' : '청구서 발송'}
                                  className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                                >
                                  발송
                                </button>
                              )
                            })()}
                            {(inv.status === 'sent' || inv.status === 'overdue') && (
                              <button onClick={() => paidMutation.mutate(inv.id)} disabled={paidMutation.isPending}
                                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                                결제확인
                              </button>
                            )}
                            {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                              <button
                                onClick={() => {
                                  // 사용자 입력 만기일 받기 (기본 = 현재 만기일 + 30일)
                                  const cur = dayjs(inv.due_date)
                                  const suggested = cur.add(30, 'day').format('YYYY-MM-DD')
                                  const input = prompt(
                                    `청구서 ${inv.invoice_no} 재청구\n현재 만기일: ${inv.due_date}\n\n새 만기일 (YYYY-MM-DD):`,
                                    suggested,
                                  )
                                  if (input === null) return
                                  const trimmed = input.trim()
                                  if (!trimmed) {
                                    postponeMutation.mutate({ id: inv.id })  // 백엔드 기본 +30일
                                  } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                                    postponeMutation.mutate({ id: inv.id, due_date: trimmed })
                                  } else {
                                    alert('날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)')
                                  }
                                }}
                                disabled={postponeMutation.isPending}
                                className="rounded-lg border border-blue-300 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">
                                재청구
                              </button>
                            )}
                            {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                              <button
                                onClick={() => {
                                  if (confirm(`청구서 ${inv.invoice_no}을(를) 반려(취소)하시겠습니까?\n상태가 cancelled로 변경됩니다. 정산은 그대로 유지됩니다.`)) {
                                    cancelMutation.mutate(inv.id)
                                  }
                                }}
                                disabled={cancelMutation.isPending}
                                className="rounded-lg border border-amber-300 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50">
                                반려
                              </button>
                            )}
                            <button
                              onClick={() => {
                                const msg = inv.status === 'paid'
                                  ? `결제완료된 청구서 ${inv.invoice_no}을(를) 정말 삭제하시겠습니까?\n\n묶여있던 정산은 다시 미발행 상태로 돌아갑니다.`
                                  : `청구서 ${inv.invoice_no}을(를) 삭제하시겠습니까?\n묶여있던 정산은 다시 미발행 상태로 돌아갑니다.`
                                if (confirm(msg)) deleteMutation.mutate(inv.id)
                              }}
                              disabled={deleteMutation.isPending}
                              className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                              삭제
                            </button>
                          </div>
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
    </div>
  )
}
