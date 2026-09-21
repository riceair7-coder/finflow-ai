import React from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '../../api/reports'
import dayjs from 'dayjs'

interface Props {
  startDate?: string
  endDate?: string
}

function formatKRW(value: number) {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`
  if (value >= 10_000) return `${(value / 10_000).toFixed(0)}만`
  return `${value.toLocaleString()}`
}

export function CashflowChart({ startDate, endDate }: Props) {
  const start = startDate ?? dayjs().subtract(6, 'month').format('YYYY-MM-DD')
  const end = endDate ?? dayjs().format('YYYY-MM-DD')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['cashflow', start, end],
    queryFn: () => reportsApi.cashflow(start, end),
  })

  const chartData: { month: string; total: number }[] = data?.data.data.cashflow ?? []
  const hasValues = chartData.some(d => Number(d.total) > 0)

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">월별 현금흐름</h3>
        <div className="h-60 animate-pulse rounded-lg bg-gray-100" />
      </div>
    )
  }

  // 빈 컨테이너만 남던 문제 — 실패/무데이터를 명시적으로 알린다
  if (isError || !hasValues) {
    return (
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">월별 현금흐름</h3>
        <div className="flex h-60 flex-col items-center justify-center gap-2 rounded-lg bg-gray-50 text-center">
          <span className="text-2xl text-gray-300">📊</span>
          <p className="text-sm text-gray-500">
            {isError ? '차트를 불러오지 못했습니다.' : '해당 기간에 거래 데이터가 없습니다.'}
          </p>
          <p className="text-xs text-gray-400">{start} ~ {end}</p>
          {isError && (
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-1 rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-white"
            >
              다시 시도
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-700">월별 현금흐름</h3>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={formatKRW} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => [`${v.toLocaleString()}원`, '거래금액']} />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#colorTotal)"
            name="거래금액"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
