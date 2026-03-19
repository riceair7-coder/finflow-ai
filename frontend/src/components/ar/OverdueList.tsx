import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { invoicesApi } from '../../api/invoices'
import dayjs from 'dayjs'

function formatKRW(n: number) {
  return `₩${n.toLocaleString('ko-KR')}`
}

export function OverdueList() {
  const { data, isLoading } = useQuery({
    queryKey: ['ar', 'overdue'],
    queryFn: () => invoicesApi.getOverdue(),
    select: (res) => res.data.data,
    refetchInterval: 60_000,
  })

  const totalOverdue = (data ?? []).reduce((sum, inv) => sum + inv.total_amount, 0)

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <h3 className="font-semibold text-gray-800">연체 현황</h3>
        {!isLoading && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
            {formatKRW(totalOverdue)}
          </span>
        )}
      </div>
      <div className="divide-y">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-5 py-4">
              <div className="h-4 animate-pulse rounded bg-gray-200" />
            </div>
          ))
        ) : (data ?? []).length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">연체 청구서 없음 ✅</div>
        ) : (
          (data ?? []).map((inv) => {
            const daysOverdue = dayjs().diff(dayjs(inv.due_date), 'day')
            return (
              <div key={inv.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-gray-800">{inv.invoice_no}</p>
                  <p className="text-xs text-gray-500">만기: {inv.due_date}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-red-600">{formatKRW(inv.total_amount)}</p>
                  <p className="text-xs text-red-400">{daysOverdue}일 연체</p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
