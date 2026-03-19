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

  const { data, isLoading } = useQuery({
    queryKey: ['cashflow', start, end],
    queryFn: () => reportsApi.cashflow(start, end),
  })

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border bg-white">
        <p className="text-sm text-gray-400">로딩 중...</p>
      </div>
    )
  }

  const chartData = data?.data.data.cashflow ?? []

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
