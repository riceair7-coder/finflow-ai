import React, { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '../api/reports'
import { settlementsApi } from '../api/settlements'
import { transactionsApi } from '../api/transactions'
import { vendorsApi } from '../api/vendors'
import { RealtimeBadge } from '../components/common/RealtimeBadge'

// 차트 라이브러리(recharts)가 무거워 KPI 카드 렌더를 막지 않도록 분리 로드
const CashflowChart = lazy(() =>
  import('../components/dashboard/CashflowChart').then(m => ({ default: m.CashflowChart })),
)

const DETAIL_LIMIT = 50

type CardKind = 'monthly' | 'unsettled' | 'approved' | 'prepaid'

function fmt(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`
  return n.toLocaleString()
}

type Accent = 'blue' | 'amber' | 'emerald' | 'rose' | 'violet'

function StatCard({ label, value, sub, trend, accent, icon, active, onClick }: {
  label: string; value: string; sub?: string; trend?: number; accent: Accent; icon: string
  active?: boolean; onClick?: () => void
}) {
  const m: Record<Accent, { card: string; ico: string; val: string; ring: string }> = {
    blue:    { card: 'from-blue-50 border-blue-100',       ico: 'bg-blue-100 text-blue-600',       val: 'text-blue-700',    ring: 'ring-blue-300' },
    amber:   { card: 'from-amber-50 border-amber-100',     ico: 'bg-amber-100 text-amber-600',     val: 'text-amber-700',   ring: 'ring-amber-300' },
    emerald: { card: 'from-emerald-50 border-emerald-100', ico: 'bg-emerald-100 text-emerald-600', val: 'text-emerald-700', ring: 'ring-emerald-300' },
    rose:    { card: 'from-rose-50 border-rose-100',       ico: 'bg-rose-100 text-rose-600',       val: 'text-rose-700',    ring: 'ring-rose-300' },
    violet:  { card: 'from-violet-50 border-violet-100',   ico: 'bg-violet-100 text-violet-600',   val: 'text-violet-700',  ring: 'ring-violet-300' },
  }
  const c = m[accent]
  const body = (
    <>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1 text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
          <p className={`mt-2 text-2xl font-bold ${c.val}`}>{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
          {trend !== undefined && (
            <p className={`mt-1.5 text-xs font-semibold ${trend > 0 ? 'text-rose-500' : trend < 0 ? 'text-emerald-500' : 'text-gray-400'}`}>
              {trend > 0 ? '▲' : trend < 0 ? '▼' : '—'} {Math.abs(trend).toFixed(1)}% 전월 대비
            </p>
          )}
        </div>
        <div className={`ml-3 shrink-0 rounded-xl p-2.5 text-xl ${c.ico}`}>{icon}</div>
      </div>
      {onClick && (
        <p className="mt-2 text-[11px] font-medium text-gray-400">
          {active ? '▲ 접기' : '▼ 펼쳐보기'}
        </p>
      )}
    </>
  )
  const base = `block w-full rounded-2xl border bg-gradient-to-br ${c.card} to-white p-5 shadow-sm`
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} transition-shadow hover:shadow-md ${active ? `ring-2 ${c.ring}` : ''}`}
      >
        {body}
      </button>
    )
  }
  return <div className={base}>{body}</div>
}

function AIBar({ label, pct, color, text }: { label: string; pct: number; color: string; text: string }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between">
        <span className="text-xs text-gray-500">{label}</span>
        <span className={`text-xs font-bold ${text}`}>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-2 rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => reportsApi.summary(),
    refetchInterval: 60_000,
  })
  const s = data?.data.data
  const today = new Date()
  const ymd = (d: Date) => d.toISOString().slice(0, 10)
  const sixAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const failPct = Math.max(0, 100 - (s?.ai_classified_pct ?? 0) - (s?.ai_pending_pct ?? 0))

  const [openCard, setOpenCard] = useState<CardKind | null>(null)
  const toggle = (k: CardKind) => setOpenCard(prev => prev === k ? null : k)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">재무 현황</h2>
          <p className="mt-0.5 text-sm text-gray-400">{today.getFullYear()}년 {today.getMonth() + 1}월 기준 · 실시간 지표</p>
        </div>
        <RealtimeBadge />
      </div>

      <AlertBanner
        unassigned={s?.unassigned_dept_count ?? 0}
        outlierCount={s?.outlier_count ?? 0}
        outlierMax={s?.outlier_max_amount ?? 0}
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[0,1,2,3].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard label="이번달 총 지출" value={`₩${fmt(s?.monthly_total ?? 0)}`} trend={s?.monthly_change_pct} accent="blue" icon="💸"
            active={openCard === 'monthly'} onClick={() => toggle('monthly')} />
          {/* '미처리 정산(pending 상태 정산서)'은 자동승인 탓에 늘 0이라 대시보드가
              정산관리 화면과 어긋나 보였다. 실제 처리할 물량인 '미정산 거래'를 대표값으로 올리고,
              결재대기 건수는 보조 정보로 함께 표기한다. */}
          <StatCard
            label="미정산 거래"
            value={`${s?.unsettled_count ?? 0}건`}
            sub={`₩${fmt(s?.unsettled_amount ?? 0)} · 공급자 ${s?.unsettled_vendor_count ?? 0}곳 · 결재대기 ${s?.pending_settlement_count ?? 0}건`}
            accent="amber"
            icon="📋"
            active={openCard === 'unsettled'}
            onClick={() => toggle('unsettled')}
          />
          <StatCard label="승인된 정산" value={`${s?.approved_settlement_count ?? 0}건`} sub={`₩${fmt(s?.approved_settlement_amount ?? 0)}`} accent="emerald" icon="✅"
            active={openCard === 'approved'} onClick={() => toggle('approved')} />
          <StatCard
            label="사전입금"
            value={`${s?.prepaid_count ?? 0}건`}
            sub={`₩${fmt(s?.prepaid_amount ?? 0)} · 이번달 ${s?.prepaid_month_count ?? 0}건 ₩${fmt(s?.prepaid_month_amount ?? 0)}`}
            accent="violet"
            icon="💳"
            active={openCard === 'prepaid'}
            onClick={() => toggle('prepaid')}
          />
        </div>
      )}

      {openCard && (
        <DetailPanel kind={openCard} monthStart={ymd(monthStart)} today={ymd(today)} onClose={() => setOpenCard(null)} />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Suspense fallback={
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">월별 현금흐름</h3>
            <div className="h-60 animate-pulse rounded-lg bg-gray-100" />
          </div>
        }>
          <CashflowChart startDate={ymd(sixAgo)} endDate={ymd(today)} />
        </Suspense>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">AI 자동분류 현황</h3>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{s?.ai_classified_pct ?? 0}% 완료</span>
          </div>
          <div className="space-y-4">
            <AIBar label="자동 분류 완료" pct={s?.ai_classified_pct ?? 0} color="bg-emerald-500" text="text-emerald-700" />
            <AIBar label="수동 검토 필요" pct={s?.ai_pending_pct ?? 0}    color="bg-amber-400"   text="text-amber-700" />
            <AIBar label="분류 대기"      pct={failPct}                    color="bg-rose-400"    text="text-rose-700" />
          </div>
          <p className="mt-5 text-xs text-gray-400">사업자등록번호 기반 자동 매핑 포함</p>
        </div>
      </div>
    </div>
  )
}

// ──────────────── Detail panel ────────────────

const TITLES: Record<CardKind, { title: string; link: string; linkLabel: string }> = {
  monthly:   { title: '이번달 거래',                 link: '/transactions',                linkLabel: '거래내역 전체 보기' },
  unsettled: { title: '미정산 거래 (공급자별)',       link: '/settlements',                 linkLabel: '정산 관리로 이동' },
  approved:  { title: '승인된 정산 (approved)',      link: '/settlements?status=approved', linkLabel: '정산 관리로 이동' },
  prepaid:   { title: '사전입금 거래',               link: '/settlements?status=prepaid',  linkLabel: '정산 관리로 이동' },
}

function AlertBanner({ unassigned, outlierCount, outlierMax }: {
  unassigned: number; outlierCount: number; outlierMax: number
}) {
  if (unassigned === 0 && outlierCount === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3">
      <span className="text-lg" aria-hidden>⚠</span>
      <span className="text-sm font-semibold text-amber-800">확인이 필요한 거래</span>
      {outlierCount > 0 && (
        <Link
          to="/transactions"
          className="rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
        >
          이번달 지출의 30% 이상인 단일 거래 {outlierCount}건 (최대 ₩{fmt(outlierMax)}) →
        </Link>
      )}
      {unassigned > 0 && (
        <Link
          to="/transactions"
          className="rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
        >
          부서 미배정 {unassigned}건 →
        </Link>
      )}
    </div>
  )
}

function DetailPanel({ kind, monthStart, today, onClose }: {
  kind: CardKind; monthStart: string; today: string; onClose: () => void
}) {
  const { title, link, linkLabel } = TITLES[kind]
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <div className="flex items-center gap-2">
          <Link to={link} className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">
            {linkLabel} →
          </Link>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">✕</button>
        </div>
      </div>
      {kind === 'monthly'   && <MonthTransactions monthStart={monthStart} today={today} />}
      {kind === 'unsettled' && <UnsettledVendorList />}
      {kind === 'approved'  && <SettlementList status="approved" />}
      {kind === 'prepaid'   && <PrepaidTransactions />}
    </section>
  )
}

function useVendorMap() {
  const { data } = useQuery({
    queryKey: ['vendors-all'],
    queryFn: () => vendorsApi.list({ limit: 200 }),
  })
  const vendors = data?.data.data ?? []
  return Object.fromEntries(vendors.map(v => [v.id, v.name]))
}

function fmtKRW(n: number) { return `₩${n.toLocaleString('ko-KR')}` }

type SortDir = 'asc' | 'desc'

function useSort<T extends string>(initial: T, initialDir: SortDir = 'desc') {
  const [sortBy, setSortBy] = useState<T>(initial)
  const [sortDir, setSortDir] = useState<SortDir>(initialDir)
  const onSort = (k: T) => {
    if (k === sortBy) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(k); setSortDir('asc') }
  }
  return { sortBy, sortDir, onSort }
}

function sortRows<R, K extends string>(rows: R[], sortBy: K, sortDir: SortDir, keyFn: (r: R, k: K) => any): R[] {
  const out = [...rows]
  out.sort((a, b) => {
    const av = keyFn(a, sortBy), bv = keyFn(b, sortBy)
    if (av == null && bv == null) return 0
    if (av == null) return sortDir === 'asc' ? -1 : 1
    if (bv == null) return sortDir === 'asc' ? 1 : -1
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })
  return out
}

function SortHeader<K extends string>({ field, label, sortBy, sortDir, onSort, align }: {
  field: K; label: string; sortBy: K; sortDir: SortDir; onSort: (k: K) => void
  align?: 'left' | 'right'
}) {
  const active = field === sortBy
  return (
    <th className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-0.5 hover:text-gray-800 ${active ? 'font-semibold text-gray-700' : ''}`}
      >
        {label}
        <span className={`text-[10px] ${active ? 'text-gray-700' : 'text-gray-300'}`}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

function SearchInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full max-w-sm rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
      {value && (
        <button onClick={() => onChange('')} className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">초기화</button>
      )}
    </div>
  )
}

function EmptyOrLoading({ loading, empty, msg }: { loading: boolean; empty: boolean; msg: string }) {
  if (loading) return <p className="py-8 text-center text-xs text-gray-400">불러오는 중...</p>
  if (empty) return <p className="py-8 text-center text-xs text-gray-400">{msg}</p>
  return null
}

function Footer({ shown, total, loaded }: { shown: number; total: number; loaded: number }) {
  return (
    <p className="border-t bg-gray-50 px-3 py-2 text-center text-[11px] text-gray-500">
      {shown}건 표시 · 로드 {loaded}건 / 전체 {total}건
      {total > loaded && <span className="ml-1 text-amber-600">(전체 보기로 더 보기)</span>}
    </p>
  )
}

function MonthTransactions({ monthStart, today }: { monthStart: string; today: string }) {
  const vendorMap = useVendorMap()
  const [q, setQ] = useState('')
  type Field = 'date' | 'vendor' | 'description' | 'amount'
  const { sortBy, sortDir, onSort } = useSort<Field>('date', 'desc')
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-month-txs', monthStart, today],
    queryFn: () => transactionsApi.list({ date_from: monthStart, date_to: today, limit: DETAIL_LIMIT }),
  })
  const rows = data?.data.data ?? []
  const total = data?.data.meta?.total ?? 0
  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase()
    if (!key) return rows
    return rows.filter(t => {
      const vname = t.vendor_id ? (vendorMap[t.vendor_id] ?? '') : ''
      return (
        vname.toLowerCase().includes(key) ||
        (t.description ?? '').toLowerCase().includes(key) ||
        (t.external_id ?? '').toLowerCase().includes(key)
      )
    })
  }, [rows, q, vendorMap])
  const sorted = useMemo(() => sortRows(filtered, sortBy, sortDir, (t, k) => {
    if (k === 'date') return t.transaction_date
    if (k === 'vendor') return t.vendor_id ? (vendorMap[t.vendor_id] ?? '') : ''
    if (k === 'description') return (t.description ?? '').toLowerCase()
    return Number(t.amount)
  }), [filtered, sortBy, sortDir, vendorMap])
  return (
    <>
      <SearchInput value={q} onChange={setQ} placeholder="공급자명·품목·승인번호 검색" />
      <EmptyOrLoading loading={isLoading} empty={!isLoading && sorted.length === 0} msg={q ? '검색 결과가 없습니다.' : '이번달 거래가 없습니다.'} />
      {sorted.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <SortHeader field="date" label="거래일자" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                <SortHeader field="vendor" label="공급자" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                <SortHeader field="description" label="품목" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                <SortHeader field="amount" label="금액" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{t.transaction_date}</td>
                  <td className="px-3 py-2">{t.vendor_id ? (vendorMap[t.vendor_id] ?? '-') : <span className="text-gray-300">-</span>}</td>
                  <td className="px-3 py-2 max-w-[280px] truncate" title={t.description ?? ''}>{t.description ?? '-'}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{fmtKRW(Number(t.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Footer shown={sorted.length} total={total} loaded={rows.length} />
        </div>
      )}
    </>
  )
}

/** 정산관리의 '미정산 공급자'와 같은 데이터를 대시보드에서 바로 확인 */
function UnsettledVendorList() {
  const vendorMap = useVendorMap()
  const [q, setQ] = useState('')
  type Field = 'vendor' | 'count' | 'amount' | 'earliest'
  const { sortBy, sortDir, onSort } = useSort<Field>('amount', 'desc')
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-unsettled-vendors'],
    queryFn: () => settlementsApi.unsettledByVendor(),
  })
  const rows = data?.data.data ?? []
  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase()
    if (!key) return rows
    return rows.filter(r => (vendorMap[r.vendor_id] ?? '').toLowerCase().includes(key))
  }, [rows, q, vendorMap])
  const sorted = useMemo(() => sortRows(filtered, sortBy, sortDir, (r, k) => {
    if (k === 'vendor') return vendorMap[r.vendor_id] ?? ''
    if (k === 'count') return r.count
    if (k === 'earliest') return r.earliest_date ?? ''
    return Number(r.total_amount)
  }), [filtered, sortBy, sortDir, vendorMap])
  const shown = sorted.slice(0, DETAIL_LIMIT)
  const totalAmount = filtered.reduce((sum, r) => sum + Number(r.total_amount), 0)

  return (
    <>
      <SearchInput value={q} onChange={setQ} placeholder="공급자명 검색" />
      <EmptyOrLoading loading={isLoading} empty={!isLoading && shown.length === 0} msg={q ? '검색 결과가 없습니다.' : '미정산 거래가 없습니다.'} />
      {shown.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <SortHeader field="vendor" label="공급자" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                <SortHeader field="earliest" label="최초 거래일" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                <SortHeader field="count" label="건수" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" />
                <SortHeader field="amount" label="미정산 금액" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map(r => (
                <tr key={r.vendor_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">{vendorMap[r.vendor_id] ?? '-'}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.earliest_date ?? '-'}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{r.count}건</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{fmtKRW(Number(r.total_amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t bg-gray-50 px-3 py-2 text-center text-[11px] text-gray-500">
            공급자 {shown.length}곳 표시 / 전체 {filtered.length}곳 · 합계 {fmtKRW(totalAmount)}
            {filtered.length > shown.length && <span className="ml-1 text-amber-600">(정산 관리에서 전체 보기)</span>}
          </p>
        </div>
      )}
    </>
  )
}

function SettlementList({ status }: { status: 'pending' | 'approved' }) {
  const vendorMap = useVendorMap()
  const [q, setQ] = useState('')
  type Field = 'no' | 'vendor' | 'period' | 'amount'
  const { sortBy, sortDir, onSort } = useSort<Field>('no', 'desc')
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-settlements', status],
    queryFn: () => settlementsApi.list({ status, limit: DETAIL_LIMIT }),
  })
  const rows = data?.data.data ?? []
  const total = data?.data.meta?.total ?? 0
  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase()
    if (!key) return rows
    return rows.filter(stl => {
      const vname = vendorMap[stl.vendor_id] ?? ''
      return vname.toLowerCase().includes(key) || stl.settlement_no.toLowerCase().includes(key)
    })
  }, [rows, q, vendorMap])
  const sorted = useMemo(() => sortRows(filtered, sortBy, sortDir, (stl, k) => {
    if (k === 'no') return stl.settlement_no
    if (k === 'vendor') return vendorMap[stl.vendor_id] ?? ''
    if (k === 'period') return stl.period_start
    return Number(stl.total_amount)
  }), [filtered, sortBy, sortDir, vendorMap])
  return (
    <>
      <SearchInput value={q} onChange={setQ} placeholder="정산번호·공급자명 검색" />
      <EmptyOrLoading loading={isLoading} empty={!isLoading && sorted.length === 0} msg={q ? '검색 결과가 없습니다.' : '해당 정산이 없습니다.'} />
      {sorted.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <SortHeader field="no" label="정산번호" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                <SortHeader field="vendor" label="공급자" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                <SortHeader field="period" label="정산기간" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                <SortHeader field="amount" label="정산금액" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map(stl => (
                <tr key={stl.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-700">{stl.settlement_no}</td>
                  <td className="px-3 py-2">{vendorMap[stl.vendor_id] ?? '-'}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{stl.period_start} ~ {stl.period_end}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{fmtKRW(Number(stl.total_amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Footer shown={sorted.length} total={total} loaded={rows.length} />
        </div>
      )}
    </>
  )
}

function PrepaidTransactions() {
  const vendorMap = useVendorMap()
  const [q, setQ] = useState('')
  type Field = 'date' | 'vendor' | 'description' | 'paid_at' | 'amount'
  const { sortBy, sortDir, onSort } = useSort<Field>('paid_at', 'desc')
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-prepaid'],
    queryFn: () => transactionsApi.list({ view: 'prepaid', limit: DETAIL_LIMIT }),
  })
  const rows = data?.data.data ?? []
  const total = data?.data.meta?.total ?? 0
  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase()
    if (!key) return rows
    return rows.filter(t => {
      const vname = t.vendor_id ? (vendorMap[t.vendor_id] ?? '') : ''
      return (
        vname.toLowerCase().includes(key) ||
        (t.description ?? '').toLowerCase().includes(key) ||
        (t.external_id ?? '').toLowerCase().includes(key)
      )
    })
  }, [rows, q, vendorMap])
  const sorted = useMemo(() => sortRows(filtered, sortBy, sortDir, (t, k) => {
    if (k === 'date') return t.transaction_date
    if (k === 'vendor') return t.vendor_id ? (vendorMap[t.vendor_id] ?? '') : ''
    if (k === 'description') return (t.description ?? '').toLowerCase()
    if (k === 'paid_at') return t.paid_at ?? ''
    return Number(t.amount)
  }), [filtered, sortBy, sortDir, vendorMap])
  return (
    <>
      <SearchInput value={q} onChange={setQ} placeholder="공급자명·품목·승인번호 검색" />
      <EmptyOrLoading loading={isLoading} empty={!isLoading && sorted.length === 0} msg={q ? '검색 결과가 없습니다.' : '사전입금 거래가 없습니다.'} />
      {sorted.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <SortHeader field="date" label="거래일자" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                <SortHeader field="vendor" label="공급자" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                <SortHeader field="description" label="품목" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                <SortHeader field="paid_at" label="결제완료일" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                <SortHeader field="amount" label="금액" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map(t => (
                <tr key={t.id} className="hover:bg-amber-50/40 bg-amber-50/20">
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{t.transaction_date}</td>
                  <td className="px-3 py-2">{t.vendor_id ? (vendorMap[t.vendor_id] ?? '-') : <span className="text-gray-300">-</span>}</td>
                  <td className="px-3 py-2 max-w-[260px] truncate" title={t.description ?? ''}>{t.description ?? '-'}</td>
                  <td className="px-3 py-2 text-emerald-700 whitespace-nowrap">{t.paid_at ?? '-'}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{fmtKRW(Number(t.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Footer shown={sorted.length} total={total} loaded={rows.length} />
        </div>
      )}
    </>
  )
}
