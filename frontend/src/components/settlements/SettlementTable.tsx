import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settlementsApi, type Settlement } from '../../api/settlements'
import { vendorsApi } from '../../api/vendors'
import { STATUS_COLORS, STATUS_LABELS } from '../../types'
import clsx from 'clsx'

function formatKRW(amount: number) {
  return `₩${amount.toLocaleString('ko-KR')}`
}

export function SettlementTable() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['settlements', page, statusFilter],
    queryFn: () => settlementsApi.list({ page, limit: 20, status: statusFilter || undefined }),
  })
  const { data: vendorData } = useQuery({
    queryKey: ['vendors-all'],
    queryFn: () => vendorsApi.list({ limit: 200 }),
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => settlementsApi.approve(id, notes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settlements'] }),
  })
  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => settlementsApi.reject(id, notes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settlements'] }),
  })

  const settlements = data?.data.data ?? []
  const meta = data?.data.meta
  const vendorMap = Object.fromEntries((vendorData?.data.data ?? []).map(v => [v.id, v]))

  return (
    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b bg-gray-50 px-5 py-4">
        <h3 className="font-semibold text-gray-800">정산 목록</h3>
        <select
          className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
        >
          <option value="">전체</option>
          <option value="pending">대기중</option>
          <option value="reviewing">검토중</option>
          <option value="approved">승인됨</option>
          <option value="rejected">반려됨</option>
          <option value="paid">지급완료</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="px-5 py-3">정산번호</th>
              <th className="px-5 py-3">공급자</th>
              <th className="px-5 py-3">정산기간</th>
              <th className="px-5 py-3 text-right">금액</th>
              <th className="px-5 py-3">상태</th>
              <th className="px-5 py-3">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-4"><div className="h-4 animate-pulse rounded bg-gray-100" /></td>
                    ))}
                  </tr>
                ))
              : settlements.map(s => {
                  const vendor = s.vendor_id ? vendorMap[s.vendor_id] : null
                  return (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 font-mono text-xs text-gray-500">{s.settlement_no}</td>
                      <td className="px-5 py-4">
                        {vendor ? (
                          <div>
                            <p className="font-medium text-gray-900">{vendor.name}</p>
                            <p className="text-xs text-gray-400 font-mono">{vendor.business_registration_no}</p>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">{s.vendor_id?.slice(0, 8)}...</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-xs whitespace-nowrap">{s.period_start} ~ {s.period_end}</td>
                      <td className="px-5 py-4 text-right font-semibold text-gray-900">{formatKRW(s.total_amount)}</td>
                      <td className="px-5 py-4">
                        <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_COLORS[s.status])}>
                          {STATUS_LABELS[s.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {(s.status === 'pending' || s.status === 'reviewing') && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => approveMutation.mutate({ id: s.id })}
                              className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                              disabled={approveMutation.isPending}
                            >승인</button>
                            <button
                              onClick={() => rejectMutation.mutate({ id: s.id })}
                              className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                              disabled={rejectMutation.isPending}
                            >반려</button>
                          </div>
                        )}
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
  )
}
