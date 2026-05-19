import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settlementsApi, type Attachment } from '../../api/settlements'
import { transactionsApi } from '../../api/transactions'
import { vendorsApi } from '../../api/vendors'
import { departmentsApi } from '../../api/departments'
import { STATUS_COLORS, STATUS_LABELS } from '../../types'
import { useAuthStore } from '../../store/authStore'
import { SearchPanel, type SearchFilters } from '../common/SearchPanel'
import { buildDeptPaletteMap, lookupPalette, NEUTRAL } from '../../utils/deptColor'
import clsx from 'clsx'

const STATUS_PREPAID = 'prepaid'

const DEPT_ALL_KEY = '__all__'
const DEPT_UNASSIGNED_KEY = '__unassigned__'

function formatKRW(amount: number) {
  return `₩${amount.toLocaleString('ko-KR')}`
}

export function SettlementTable() {
  const initialUser = useAuthStore.getState().user
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [deptTab, setDeptTab] = useState<string>(
    initialUser && initialUser.role !== 'admin' && initialUser.department_id
      ? initialUser.department_id
      : DEPT_ALL_KEY
  )
  const [issueToast, setIssueToast] = useState<{ invoice_no: string; total: number } | null>(null)
  const [search, setSearch] = useState<SearchFilters>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [attachmentsId, setAttachmentsId] = useState<string | null>(null)
  const qc = useQueryClient()

  const isPrepaidView = statusFilter === STATUS_PREPAID

  const { data, isLoading } = useQuery({
    queryKey: ['settlements', page, statusFilter, deptTab, search],
    queryFn: () => settlementsApi.list({
      page, limit: 20,
      status: statusFilter || undefined,
      unassigned: deptTab === DEPT_UNASSIGNED_KEY ? true : undefined,
      department_id: deptTab !== DEPT_ALL_KEY && deptTab !== DEPT_UNASSIGNED_KEY ? deptTab : undefined,
      ...search,
    }),
    enabled: !isPrepaidView,
  })

  // 사전입금 뷰: transactions API에서 view=prepaid로 가져와서 정산 목록 모양으로 렌더
  const { data: prepaidTxData, isLoading: prepaidLoading } = useQuery({
    queryKey: ['settlements-prepaid-txs', page, deptTab, search],
    queryFn: () => transactionsApi.list({
      page, limit: 20,
      view: 'prepaid',
      department_id: deptTab !== DEPT_ALL_KEY && deptTab !== DEPT_UNASSIGNED_KEY ? deptTab : undefined,
      ...search,
    }),
    enabled: isPrepaidView,
  })
  const { data: vendorData } = useQuery({
    queryKey: ['vendors-all'],
    queryFn: () => vendorsApi.list({ limit: 200 }),
  })
  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentsApi.list({ is_active: true }),
  })
  const { data: deptCountsData } = useQuery({
    queryKey: ['settlements-dept-counts'],
    queryFn: () => settlementsApi.departmentCounts(),
  })
  const { data: statusCountsData } = useQuery({
    queryKey: ['settlements-status-counts'],
    queryFn: () => settlementsApi.statusCounts(),
  })
  const statusCounts = statusCountsData?.data.data

  // 정산별 첨부 건수 맵
  const { data: attachmentCountsData } = useQuery({
    queryKey: ['settlements-attachment-counts'],
    queryFn: () => settlementsApi.attachmentCounts(),
  })
  const attachmentCounts = attachmentCountsData?.data.data ?? {}

  // 사전입금 chip 카운트 — meta.total만 필요하므로 limit=1
  const { data: prepaidCountData } = useQuery({
    queryKey: ['settlements-prepaid-count'],
    queryFn: () => transactionsApi.list({ view: 'prepaid', limit: 1, page: 1 }),
  })
  const prepaidCount = prepaidCountData?.data.meta?.total ?? 0

  const revertPrepaidMutation = useMutation({
    mutationFn: (ids: string[]) => transactionsApi.bulkSetPrepaid({ tx_ids: ids, is_prepaid: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements-prepaid-txs'] })
      qc.invalidateQueries({ queryKey: ['settlements-prepaid-count'] })
      qc.invalidateQueries({ queryKey: ['unsettled-by-vendor'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['transactions-dept-counts'] })
      setSelected(new Set())
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '되돌리기 실패'),
  })

  // 승인 = 승인 + 청구서 자동 발행. 두 단계가 한 번에 처리됨.
  const approveMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      await settlementsApi.approve(id, notes)
      // 승인 직후 자동 청구서 발행
      const inv = await settlementsApi.issueInvoice(id)
      return inv.data.data
    },
    onSuccess: (invoice) => {
      setIssueToast({ invoice_no: invoice.invoice_no, total: invoice.total_amount })
      qc.invalidateQueries({ queryKey: ['settlements'] })
      qc.invalidateQueries({ queryKey: ['settlements-dept-counts'] })
      qc.invalidateQueries({ queryKey: ['settlements-status-counts'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoices-dept-counts'] })
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '승인/청구서 발행 실패'),
  })
  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => settlementsApi.reject(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements'] })
      qc.invalidateQueries({ queryKey: ['settlements-dept-counts'] })
      qc.invalidateQueries({ queryKey: ['settlements-status-counts'] })
    },
  })
  const issueMutation = useMutation({
    mutationFn: (id: string) => settlementsApi.issueInvoice(id),
    onSuccess: (res) => {
      setIssueToast({ invoice_no: res.data.data.invoice_no, total: res.data.data.total_amount })
      qc.invalidateQueries({ queryKey: ['settlements'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoices-dept-counts'] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? '청구서 발행 실패'
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => settlementsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements'] })
      qc.invalidateQueries({ queryKey: ['settlements-dept-counts'] })
      qc.invalidateQueries({ queryKey: ['settlements-status-counts'] })
      qc.invalidateQueries({ queryKey: ['unsettled-by-vendor'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '정산 삭제 실패'),
  })

  // 선택된 정산을 각각의 개별 청구서로 N건 일괄 발행 (통합 X)
  const bulkIssueMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results: { id: string; ok: boolean; invoice_no?: string; error?: string }[] = []
      for (const id of ids) {
        try {
          const res = await settlementsApi.issueInvoice(id)
          results.push({ id, ok: true, invoice_no: res.data.data.invoice_no })
        } catch (e: any) {
          results.push({ id, ok: false, error: e?.response?.data?.detail ?? '발행 실패' })
        }
      }
      return results
    },
    onSuccess: (results) => {
      const ok = results.filter(r => r.ok).length
      const fail = results.length - ok
      const lines = [`청구서 ${ok}건 발행 완료${fail ? ` · ${fail}건 실패` : ''}`]
      if (fail > 0) {
        lines.push('\n실패 상세:')
        results.filter(r => !r.ok).slice(0, 5).forEach(r => lines.push(`  · ${r.error}`))
      }
      alert(lines.join('\n'))
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['settlements'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoices-dept-counts'] })
    },
  })

  const settlements = data?.data.data ?? []
  const prepaidTxs = prepaidTxData?.data.data ?? []
  const meta = isPrepaidView ? prepaidTxData?.data.meta : data?.data.meta
  const tableLoading = isPrepaidView ? prepaidLoading : isLoading
  const vendorMap = Object.fromEntries((vendorData?.data.data ?? []).map(v => [v.id, v]))
  const departments = deptData?.data.data ?? []
  const deptMap = Object.fromEntries(departments.map(d => [d.id, d]))
  const paletteMap = buildDeptPaletteMap(departments)

  const counts = deptCountsData?.data.data
  const me = useAuthStore(s => s.user)
  const isAdmin = me?.role === 'admin'

  let tabs: { key: string; label: string; count: number; deptKey?: string }[]
  if (isAdmin) {
    tabs = [
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
    tabs = [{
      key: me.department_id,
      label: myDept ? `${myDept.name} (${myDept.code})` : '내 부서',
      count: counts?.by_department?.[me.department_id] ?? counts?.total ?? 0,
      deptKey: myDept ? (myDept.code || myDept.id) : undefined,
    }]
  } else {
    tabs = []
  }

  return (
    <div className="space-y-4">
      {issueToast && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-3">
          <span className="mt-0.5 text-emerald-600">✓</span>
          <div className="flex-1 text-sm">
            <p className="font-medium text-emerald-700">청구서 발행 완료: {issueToast.invoice_no}</p>
            <p className="mt-0.5 text-xs text-gray-600">청구 금액 {formatKRW(issueToast.total)} — 청구서 페이지에서 확인할 수 있습니다.</p>
          </div>
          <button onClick={() => setIssueToast(null)} className="rounded-lg p-1 text-gray-400 hover:bg-white">✕</button>
        </div>
      )}

      <SearchPanel
        vendors={vendorData?.data.data ?? []}
        applied={search}
        onApply={(f) => { setSearch(f); setPage(1) }}
        dateLabel="정산기간"
        searchPlaceholder="정산번호 검색..."
      />

      {/* 부서 탭 */}
      <div className="border-b border-gray-200">
        <div className="flex flex-wrap gap-1 -mb-px">
          {tabs.map(t => {
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
          })}
        </div>
      </div>

      {/* 일괄 청구서 발행 액션바 — 선택된 정산이 있을 때만 (사전입금 뷰에서는 숨김) */}
      {!isPrepaidView && selected.size > 0 && (() => {
        const selectedSettlements = settlements.filter(s => selected.has(s.id))
        const eligible = selectedSettlements.filter(s => s.status === 'approved' && !s.invoice_id)
        const skipCount = selectedSettlements.length - eligible.length
        const totalSum = eligible.reduce((sum, s) => sum + Number(s.total_amount), 0)
        return (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/50 px-5 py-3 shadow-sm">
            <span className="text-sm font-medium text-blue-700">{selected.size}건 선택됨</span>
            <span className="text-gray-300">|</span>
            <span className="text-xs text-gray-600">
              발행 대상 {eligible.length}건 · 합계 {formatKRW(totalSum)}
              {skipCount > 0 && <span className="ml-2 text-amber-700">⚠ {skipCount}건은 승인+미발행이 아니라 제외</span>}
            </span>
            <button
              onClick={() => {
                if (eligible.length === 0) return
                if (confirm(`선택한 ${eligible.length}건의 정산을 각각의 청구서로 일괄 발행합니다.\n총 ${formatKRW(totalSum)}\n계속할까요?`)) {
                  bulkIssueMutation.mutate(eligible.map(s => s.id))
                }
              }}
              disabled={eligible.length === 0 || bulkIssueMutation.isPending}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkIssueMutation.isPending ? `발행 중... (${eligible.length}건)` : `청구서 일괄 발행 (${eligible.length}건)`}
            </button>
            <button onClick={() => setSelected(new Set())} className="ml-auto rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-white">선택 해제</button>
          </div>
        )
      })()}

      {/* 상태 chip 탭 */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: '',          label: '전체' },
          { key: 'pending',   label: '대기중' },
          { key: 'reviewing', label: '검토중' },
          { key: 'approved',  label: '승인됨' },
          { key: 'rejected',  label: '반려됨' },
          { key: 'paid',      label: '결제완료' },
          { key: STATUS_PREPAID, label: '사전입금' },
        ].map(t => {
          const active = t.key === statusFilter
          let count: number
          if (t.key === '') count = statusCounts?.total ?? 0
          else if (t.key === STATUS_PREPAID) count = prepaidCount
          else count = statusCounts?.by_status?.[t.key] ?? 0
          const isPaid = t.key === 'paid'
          const isPrepaid = t.key === STATUS_PREPAID
          return (
            <button
              key={t.key || 'all'}
              onClick={() => { setStatusFilter(t.key); setPage(1); setSelected(new Set()) }}
              className={clsx(
                'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? (isPaid ? 'bg-emerald-600 text-white' : isPrepaid ? 'bg-amber-600 text-white' : 'bg-blue-600 text-white')
                  : (isPaid
                      ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : isPrepaid
                        ? 'border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'),
              )}
            >
              {t.label}
              <span className={clsx('rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-white/20' : 'bg-white text-gray-500')}>{count}</span>
            </button>
          )
        })}
      </div>

      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="border-b bg-gray-50 px-5 py-4 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">정산 목록</h3>
          {isPrepaidView && selected.size > 0 && (
            <button
              onClick={() => {
                if (confirm(`선택한 ${selected.size}건을 정산대상으로 되돌립니다.\n사전입금 표시 해제 + 결제완료일 NULL 처리.\n계속할까요?`)) {
                  revertPrepaidMutation.mutate(Array.from(selected))
                }
              }}
              disabled={revertPrepaidMutation.isPending}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
            >
              {revertPrepaidMutation.isPending ? '되돌리는 중...' : `정산대상으로 되돌리기 (${selected.size})`}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={
                      isPrepaidView
                        ? (prepaidTxs.length > 0 && prepaidTxs.every(t => selected.has(t.id)))
                        : (settlements.length > 0 && settlements.every(s => selected.has(s.id)))
                    }
                    onChange={() => {
                      const rows = isPrepaidView ? prepaidTxs : settlements
                      const allSelected = rows.every(r => selected.has(r.id))
                      setSelected(prev => {
                        const next = new Set(prev)
                        if (allSelected) rows.forEach(r => next.delete(r.id))
                        else rows.forEach(r => next.add(r.id))
                        return next
                      })
                    }}
                    className="h-4 w-4 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3">{isPrepaidView ? '승인번호' : '정산번호'}</th>
                <th className="px-4 py-3">공급자</th>
                <th className="px-4 py-3">담당 부서</th>
                <th className="px-4 py-3">{isPrepaidView ? '거래일자' : '정산기간'}</th>
                <th className="px-4 py-3 text-right">금액</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">{isPrepaidView ? '결제완료일' : '청구서'}</th>
                <th className="px-4 py-3">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tableLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-4"><div className="h-4 animate-pulse rounded bg-gray-100" /></td>
                      ))}
                    </tr>
                  ))
                : isPrepaidView ? (
                    prepaidTxs.length === 0 ? (
                      <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-400">사전입금 거래가 없습니다.</td></tr>
                    ) : prepaidTxs.map(t => {
                      const vendor = t.vendor_id ? vendorMap[t.vendor_id] : null
                      const dept = t.department_id ? deptMap[t.department_id] : null
                      const isChecked = selected.has(t.id)
                      return (
                        <tr key={t.id} className={clsx('hover:bg-gray-50 transition-colors bg-amber-50/30', isChecked && '!bg-blue-50/50')}>
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelected(prev => {
                                  const next = new Set(prev)
                                  if (next.has(t.id)) next.delete(t.id); else next.add(t.id)
                                  return next
                                })
                              }}
                              className="h-4 w-4 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-4 font-mono text-xs text-gray-500" title={t.external_id ?? ''}>
                            {t.external_id ? <span className="block max-w-[160px] truncate">{t.external_id}</span> : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-4">
                            {vendor ? (
                              <div>
                                <p className="font-medium text-gray-900 text-xs">{vendor.name}</p>
                                <p className="text-xs text-gray-400 font-mono">{vendor.business_registration_no}</p>
                              </div>
                            ) : <span className="text-gray-400 text-xs">{t.vendor_id?.slice(0, 8)}...</span>}
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
                          <td className="px-4 py-4 text-gray-500 text-xs whitespace-nowrap">{t.transaction_date}</td>
                          <td className="px-4 py-4 text-right font-semibold text-gray-900">{formatKRW(Number(t.amount))}</td>
                          <td className="px-4 py-4">
                            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">사전입금</span>
                          </td>
                          <td className="px-4 py-4 text-xs whitespace-nowrap text-emerald-700">{t.paid_at ?? '-'}</td>
                          <td className="px-4 py-4">
                            <button
                              onClick={() => {
                                if (confirm(`이 거래를 정산대상으로 되돌립니다.\n사전입금 해제 + 결제완료일 NULL.\n계속할까요?`)) {
                                  revertPrepaidMutation.mutate([t.id])
                                }
                              }}
                              disabled={revertPrepaidMutation.isPending}
                              className="rounded-lg border border-amber-300 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                            >정산대상으로</button>
                          </td>
                        </tr>
                      )
                    })
                  ) : settlements.length === 0 ? (
                    <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-400">해당 조건의 정산이 없습니다.</td></tr>
                  ) :
                  settlements.map(s => {
                    const vendor = s.vendor_id ? vendorMap[s.vendor_id] : null
                    const dept = s.department_id ? deptMap[s.department_id] : null
                    const isChecked = selected.has(s.id)
                    return (
                      <tr key={s.id} className={clsx('hover:bg-gray-50 transition-colors', isChecked && 'bg-blue-50/40')}>
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelected(prev => {
                                const next = new Set(prev)
                                if (next.has(s.id)) next.delete(s.id); else next.add(s.id)
                                return next
                              })
                            }}
                            className="h-4 w-4 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-4 font-mono text-xs">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setDetailsId(s.id)}
                              className="text-blue-600 hover:underline"
                            >
                              {s.settlement_no}
                            </button>
                            {(attachmentCounts[s.id] ?? 0) > 0 && (
                              <button
                                onClick={() => setAttachmentsId(s.id)}
                                title="첨부서류 보기"
                                className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                              >📎 {attachmentCounts[s.id]}</button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {vendor ? (
                            <div>
                              <p className="font-medium text-gray-900 text-xs">{vendor.name}</p>
                              <p className="text-xs text-gray-400 font-mono">{vendor.business_registration_no}</p>
                            </div>
                          ) : <span className="text-gray-400 text-xs">{s.vendor_id?.slice(0, 8)}...</span>}
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
                        <td className="px-4 py-4 text-gray-500 text-xs whitespace-nowrap">{s.period_start} ~ {s.period_end}</td>
                        <td className="px-4 py-4 text-right font-semibold text-gray-900">{formatKRW(s.total_amount)}</td>
                        <td className="px-4 py-4">
                          <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_COLORS[s.status])}>
                            {STATUS_LABELS[s.status]}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs font-mono text-gray-500">
                          {s.invoice_id ? <span className="text-emerald-600">발행됨</span> : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-4">
                          {(s.status === 'pending' || s.status === 'reviewing') && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  if (confirm(`정산 ${s.settlement_no}을(를) 승인하면 청구서가 자동 발행됩니다.\n\n청구 금액 ${formatKRW(s.total_amount)}\n\n계속할까요?`)) {
                                    approveMutation.mutate({ id: s.id })
                                  }
                                }}
                                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                disabled={approveMutation.isPending}
                              >{approveMutation.isPending ? '처리 중...' : '승인 + 발행'}</button>
                              <button
                                onClick={() => {
                                  if (confirm(`정산 ${s.settlement_no}을(를) 반려하시겠습니까?`)) {
                                    rejectMutation.mutate({ id: s.id })
                                  }
                                }}
                                className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                                disabled={rejectMutation.isPending}
                              >반려</button>
                            </div>
                          )}
                          {s.status === 'approved' && !s.invoice_id && (
                            <button
                              onClick={() => {
                                if (confirm(`정산 ${s.settlement_no}을(를) 청구서로 발행합니다.\n청구 금액 ${formatKRW(s.total_amount)}\n계속할까요?`)) {
                                  issueMutation.mutate(s.id)
                                }
                              }}
                              disabled={issueMutation.isPending}
                              className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              청구서 발행
                            </button>
                          )}
                          {!s.invoice_id && (
                            <button
                              onClick={() => {
                                if (confirm(`정산 ${s.settlement_no}을(를) 삭제하시겠습니까?\n묶여있던 거래는 다시 미정산으로 돌아갑니다.`)) {
                                  deleteMutation.mutate(s.id)
                                }
                              }}
                              disabled={deleteMutation.isPending}
                              className="ml-2 rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              삭제
                            </button>
                          )}
                          <button
                            onClick={() => setAttachmentsId(s.id)}
                            className="ml-2 rounded-lg border border-amber-200 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50"
                          >
                            📎 첨부서류 {(attachmentCounts[s.id] ?? 0) > 0 ? `(${attachmentCounts[s.id]})` : ''}
                          </button>
                          <button
                            onClick={() => setDetailsId(s.id)}
                            className="ml-2 rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                          >
                            상세
                          </button>
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

      {detailsId && (
        <SettlementDetailsModal
          settlementId={detailsId}
          vendorMap={vendorMap}
          onClose={() => setDetailsId(null)}
        />
      )}

      {attachmentsId && (
        <AttachmentsViewModal
          settlementId={attachmentsId}
          settlementNo={
            settlements.find(s => s.id === attachmentsId)?.settlement_no ?? attachmentsId.slice(0, 8)
          }
          onClose={() => setAttachmentsId(null)}
        />
      )}
    </div>
  )
}

function AttachmentsViewModal({
  settlementId, settlementNo, onClose,
}: {
  settlementId: string
  settlementNo: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between border-b bg-white px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">첨부서류</h2>
            <p className="mt-0.5 text-xs text-gray-400 font-mono">{settlementNo}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">✕</button>
        </div>
        <div className="p-6">
          <AttachmentsSection settlementId={settlementId} />
        </div>
      </div>
    </div>
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const ATTACHMENT_KINDS = ['거래명세서', '영수증', '견적서', '계약서', '기타'] as const
const PREVIEW_IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

function getAttachmentExt(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

function getPreviewKind(att: Attachment): 'image' | 'pdf' | 'unsupported' {
  const ext = getAttachmentExt(att.filename)
  if (PREVIEW_IMAGE_EXT.has(ext)) return 'image'
  if (ext === 'pdf' || (att.content_type ?? '').includes('pdf')) return 'pdf'
  return 'unsupported'
}

function AttachmentPreviewModal({
  settlementId, attachment, onClose,
}: {
  settlementId: string
  attachment: Attachment
  onClose: () => void
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const kind = getPreviewKind(attachment)

  useEffect(() => {
    if (kind === 'unsupported') return
    let cancelled = false
    let currentUrl: string | null = null
    setError(null)
    setBlobUrl(null)
    settlementsApi.previewAttachment(settlementId, attachment.id)
      .then(res => {
        if (cancelled) return
        currentUrl = URL.createObjectURL(res.data as Blob)
        setBlobUrl(currentUrl)
      })
      .catch((e: any) => {
        if (cancelled) return
        const msg = e?.response?.data?.detail ?? e?.message ?? '미리보기 실패'
        setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
      })
    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [settlementId, attachment.id, kind])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="flex w-full max-w-5xl max-h-[92vh] flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900" title={attachment.filename}>
              {attachment.filename}
            </p>
            <p className="text-xs text-gray-400">
              {attachment.kind && <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{attachment.kind}</span>}
              {formatFileSize(attachment.file_size)}
            </p>
          </div>
          <div className="ml-3 flex items-center gap-2 shrink-0">
            <button
              onClick={async () => {
                try {
                  const res = await settlementsApi.downloadAttachment(settlementId, attachment.id)
                  const url = URL.createObjectURL(res.data as Blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = attachment.filename
                  document.body.appendChild(a); a.click(); a.remove()
                  URL.revokeObjectURL(url)
                } catch (e: any) {
                  alert('다운로드 실패: ' + (e?.message ?? ''))
                }
              }}
              className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >다운로드</button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">✕</button>
          </div>
        </div>

        <div className="min-h-[300px] flex-1 overflow-auto bg-gray-50 p-4">
          {kind === 'unsupported' ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
              <span className="text-4xl">📄</span>
              <p className="text-sm font-medium text-gray-700">이 형식은 미리보기를 지원하지 않습니다.</p>
              <p className="text-xs text-gray-400">
                {getAttachmentExt(attachment.filename).toUpperCase() || '알 수 없음'} 파일은 다운로드해서 확인해주세요.
              </p>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center py-16 text-sm text-red-600">{error}</div>
          ) : !blobUrl ? (
            <div className="flex h-full items-center justify-center py-16 text-sm text-gray-400">불러오는 중...</div>
          ) : kind === 'image' ? (
            <div className="flex h-full items-center justify-center">
              <img src={blobUrl} alt={attachment.filename} className="max-h-[78vh] max-w-full object-contain" />
            </div>
          ) : (
            <iframe
              src={blobUrl}
              title={attachment.filename}
              className="h-[78vh] w-full rounded-lg border bg-white"
            />
          )}
        </div>
      </div>
    </div>
  )
}

function AttachmentsSection({ settlementId }: { settlementId: string }) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [kind, setKind] = useState<string>('거래명세서')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [previewing, setPreviewing] = useState<Attachment | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['settlement-attachments', settlementId],
    queryFn: () => settlementsApi.listAttachments(settlementId),
  })
  const attachments: Attachment[] = data?.data.data ?? []

  const uploading = progress !== null

  async function handleFiles(files: File[]) {
    if (files.length === 0) return
    const errors: { name: string; reason: string }[] = []
    setProgress({ done: 0, total: files.length })
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      try {
        await settlementsApi.uploadAttachment(settlementId, f, kind)
      } catch (e: any) {
        const reason = e?.response?.data?.detail ?? e?.message ?? '업로드 실패'
        errors.push({ name: f.name, reason: typeof reason === 'string' ? reason : JSON.stringify(reason) })
      }
      setProgress({ done: i + 1, total: files.length })
    }
    setProgress(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    qc.invalidateQueries({ queryKey: ['settlement-attachments', settlementId] })
    qc.invalidateQueries({ queryKey: ['settlements-attachment-counts'] })
    if (errors.length > 0) {
      const lines = [`${errors.length}/${files.length}건 업로드 실패:`]
      errors.slice(0, 10).forEach(e => lines.push(`  · ${e.name}: ${e.reason}`))
      if (errors.length > 10) lines.push(`  ... 외 ${errors.length - 10}건`)
      alert(lines.join('\n'))
    }
  }

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => settlementsApi.deleteAttachment(settlementId, attachmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlement-attachments', settlementId] })
      qc.invalidateQueries({ queryKey: ['settlements-attachment-counts'] })
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '삭제 실패'),
  })

  const handleDownload = async (att: Attachment) => {
    try {
      const res = await settlementsApi.downloadAttachment(settlementId, att.id)
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = att.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert('다운로드 실패: ' + (e?.message ?? ''))
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          첨부파일 ({attachments.length}건)
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            disabled={uploading}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
          >
            {ATTACHMENT_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length > 0) handleFiles(files)
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading
              ? `업로드 중... (${progress!.done}/${progress!.total})`
              : '+ 파일 첨부 (다중 선택)'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border bg-gray-50 px-4 py-6 text-center text-xs text-gray-400">불러오는 중...</div>
      ) : attachments.length === 0 ? (
        <div className="rounded-xl border bg-gray-50 px-4 py-6 text-center text-xs text-gray-400">
          첨부된 파일이 없습니다. 거래명세서·영수증·견적서 등을 업로드할 수 있습니다.
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {attachments.map(a => {
            const previewable = getPreviewKind(a) !== 'unsupported'
            return (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="text-lg">📎</span>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => previewable ? setPreviewing(a) : handleDownload(a)}
                    className="block max-w-full truncate text-left font-medium text-gray-900 hover:text-blue-600 hover:underline"
                    title={previewable ? `${a.filename} (미리보기)` : a.filename}
                  >
                    {a.filename}
                  </button>
                  <p className="text-xs text-gray-400">
                    {a.kind && <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{a.kind}</span>}
                    {formatFileSize(a.file_size)}
                    {a.uploaded_at && <span className="ml-2">{new Date(a.uploaded_at).toLocaleString('ko-KR')}</span>}
                  </p>
                </div>
                {previewable && (
                  <button
                    onClick={() => setPreviewing(a)}
                    className="rounded-lg border border-blue-200 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-50"
                  >🔍 미리보기</button>
                )}
                <button
                  onClick={() => handleDownload(a)}
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >다운로드</button>
                <button
                  onClick={() => {
                    if (confirm(`첨부파일 "${a.filename}"을(를) 삭제할까요?`)) deleteMutation.mutate(a.id)
                  }}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                >삭제</button>
              </li>
            )
          })}
        </ul>
      )}

      {previewing && (
        <AttachmentPreviewModal
          settlementId={settlementId}
          attachment={previewing}
          onClose={() => setPreviewing(null)}
        />
      )}
    </section>
  )
}

function SettlementDetailsModal({
  settlementId, vendorMap, onClose,
}: {
  settlementId: string
  vendorMap: Record<string, any>
  onClose: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['settlement-details', settlementId],
    queryFn: () => settlementsApi.details(settlementId),
  })
  const d = data?.data.data

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between border-b bg-white px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">정산 상세</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        {isLoading || !d ? (
          <div className="p-10 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : (
          <div className="p-6 space-y-5">
            {/* 정산 기본 정보 */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">정산 정보</h3>
              <div className="rounded-xl border bg-gray-50 px-4 py-3 text-sm space-y-1">
                <p><span className="text-gray-500">정산번호:</span> <span className="font-mono">{d.settlement.settlement_no}</span></p>
                <p><span className="text-gray-500">공급자:</span> {vendorMap[d.settlement.vendor_id]?.name ?? d.settlement.vendor_id.slice(0,8)+'...'}</p>
                <p><span className="text-gray-500">정산기간:</span> {d.settlement.period_start} ~ {d.settlement.period_end}</p>
                <p><span className="text-gray-500">정산 금액:</span> <b>{formatKRW(d.settlement.total_amount)}</b></p>
                <p><span className="text-gray-500">상태:</span> {d.settlement.status}</p>
                {d.settlement.notes && <p><span className="text-gray-500">메모:</span> {d.settlement.notes}</p>}
              </div>
            </section>

            {/* 청구서 정보 */}
            {d.invoice && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">발행된 청구서</h3>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3 text-sm space-y-1">
                  <p><span className="text-gray-500">청구서번호:</span> <span className="font-mono">{d.invoice.invoice_no}</span></p>
                  <p><span className="text-gray-500">발행/만기:</span> {d.invoice.issue_date} / {d.invoice.due_date}</p>
                  <p>
                    <span className="text-gray-500">청구 금액:</span> <b>{formatKRW(d.invoice.total_amount)}</b>
                  </p>
                  <p className="text-xs text-gray-400">
                    내역 — 공급가액 {formatKRW(d.invoice.subtotal)} · 부가세 {formatKRW(d.invoice.tax_amount)}
                  </p>
                  <p><span className="text-gray-500">상태:</span> {d.invoice.status}</p>
                </div>
                {d.related_settlements.length > 0 && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/30 px-4 py-3 text-xs">
                    <p className="font-medium text-amber-900 mb-1">이 청구서에 함께 묶인 다른 정산 ({d.related_settlements.length}건):</p>
                    <ul className="space-y-0.5 ml-2">
                      {d.related_settlements.map(rs => (
                        <li key={rs.id}>
                          <span className="font-mono">{rs.settlement_no}</span> ({rs.period_start}~{rs.period_end}) · {formatKRW(rs.total_amount)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* 첨부파일 */}
            <AttachmentsSection settlementId={settlementId} />

            {/* 매칭된 거래 */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                매칭된 거래 ({d.transactions.length}건)
              </h3>
              {d.transactions.length === 0 ? (
                <div className="rounded-xl border bg-gray-50 px-4 py-6 text-center text-xs text-gray-400">
                  매칭된 거래가 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500">
                        <th className="px-3 py-2">날짜</th>
                        <th className="px-3 py-2">품목</th>
                        <th className="px-3 py-2 text-right">공급가액</th>
                        <th className="px-3 py-2 text-right">세액</th>
                        <th className="px-3 py-2 text-right">합계금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {d.transactions.map(t => (
                        <tr key={t.id}>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{t.transaction_date}</td>
                          <td className="px-3 py-2 max-w-[260px] truncate text-gray-800" title={t.description ?? ''}>{t.description ?? '-'}</td>
                          <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                            {t.supply_amount != null ? formatKRW(t.supply_amount) : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                            {t.tax_amount != null ? formatKRW(t.tax_amount) : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{formatKRW(t.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-3 py-2" colSpan={2}>합계</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {formatKRW(d.transactions.reduce((s, t) => s + (t.supply_amount ?? 0), 0))}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {formatKRW(d.transactions.reduce((s, t) => s + (t.tax_amount ?? 0), 0))}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {formatKRW(d.transactions.reduce((s, t) => s + t.amount, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
