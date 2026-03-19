import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '../api/reports'
import { CashflowChart } from '../components/dashboard/CashflowChart'

function fmt(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`
  return n.toLocaleString()
}

type Accent = 'blue' | 'amber' | 'emerald' | 'rose'

function StatCard({ label, value, sub, trend, accent, icon }: {
  label: string; value: string; sub?: string; trend?: number; accent: Accent; icon: string
}) {
  const m: Record<Accent, { card: string; ico: string; val: string }> = {
    blue:    { card: 'from-blue-50 border-blue-100',       ico: 'bg-blue-100 text-blue-600',       val: 'text-blue-700' },
    amber:   { card: 'from-amber-50 border-amber-100',     ico: 'bg-amber-100 text-amber-600',     val: 'text-amber-700' },
    emerald: { card: 'from-emerald-50 border-emerald-100', ico: 'bg-emerald-100 text-emerald-600', val: 'text-emerald-700' },
    rose:    { card: 'from-rose-50 border-rose-100',       ico: 'bg-rose-100 text-rose-600',       val: 'text-rose-700' },
  }
  const c = m[accent]
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${c.card} to-white p-5 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
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
    </div>
  )
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
  const failPct = Math.max(0, 100 - (s?.ai_classified_pct ?? 0) - (s?.ai_pending_pct ?? 0))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">재무 현황</h2>
          <p className="mt-0.5 text-sm text-gray-400">{today.getFullYear()}년 {today.getMonth() + 1}월 기준 · 실시간 지표</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />실시간 연동
        </span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[0,1,2,3].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard label="이번달 총 지출" value={`₩${fmt(s?.monthly_total ?? 0)}`} trend={s?.monthly_change_pct} accent="blue" icon="💸" />
          <StatCard label="미처리 정산" value={`${s?.pending_settlement_count ?? 0}건`} sub={`₩${fmt(s?.pending_settlement_amount ?? 0)}`} accent="amber" icon="📋" />
          <StatCard label="미수금 총액" value={`₩${fmt(s?.ar_amount ?? 0)}`} sub={`연체 ${s?.overdue_count ?? 0}건 포함`} accent="rose" icon="⚠️" />
          <StatCard label="승인된 정산" value={`${s?.approved_settlement_count ?? 0}건`} sub={`₩${fmt(s?.approved_settlement_amount ?? 0)}`} accent="emerald" icon="✅" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CashflowChart startDate={ymd(sixAgo)} endDate={ymd(today)} />
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
