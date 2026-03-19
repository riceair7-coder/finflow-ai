import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invoicesApi } from '../../api/invoices'
import { vendorsApi } from '../../api/vendors'
import { StatusBadge } from '../common/StatusBadge'
import dayjs from 'dayjs'

function formatKRW(n: number) { return `₩${n.toLocaleString('ko-KR')}` }
function isOverdueSoon(dueDate: string) { return dayjs(dueDate).diff(dayjs(), 'day') <= 7 }

export function InvoiceTable() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => invoicesApi.list(),
    select: res => res.data.data,
  })
  const { data: vendorData } = useQuery({
    queryKey: ['vendors-all'],
    queryFn: () => vendorsApi.list({ limit: 200 }),
  })
  const vendorMap = Object.fromEntries((vendorData?.data.data ?? []).map(v => [v.id, v]))

  const sendMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.send(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
  const paidMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.markPaid(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })

  return (
    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
      <div className="border-b bg-gray-50 px-5 py-4">
        <h3 className="font-semibold text-gray-800">청구서 목록</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="px-5 py-3">청구서 번호</th>
              <th className="px-5 py-3">공급자</th>
              <th className="px-5 py-3">발행일</th>
              <th className="px-5 py-3">만기일</th>
              <th className="px-5 py-3 text-right">금액</th>
              <th className="px-5 py-3">상태</th>
              <th className="px-5 py-3">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-5 py-4"><div className="h-4 animate-pulse rounded bg-gray-100" /></td>
                  ))}</tr>
                ))
              : (data ?? []).map(inv => {
                  const vendor = inv.vendor_id ? vendorMap[inv.vendor_id] : null
                  const soonDue = inv.status === 'sent' && isOverdueSoon(inv.due_date)
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 font-mono text-xs text-gray-500">{inv.invoice_no}</td>
                      <td className="px-5 py-4">
                        {vendor ? (
                          <div>
                            <p className="font-medium text-gray-900">{vendor.name}</p>
                            <p className="text-xs text-gray-400 font-mono">{vendor.business_registration_no}</p>
                          </div>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-xs">{inv.issue_date}</td>
                      <td className={`px-5 py-4 text-xs ${soonDue ? 'font-semibold text-rose-600' : 'text-gray-500'}`}>
                        {inv.due_date}
                        {soonDue && <span className="ml-1">⚠️</span>}
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-gray-900">{formatKRW(inv.total_amount)}</td>
                      <td className="px-5 py-4"><StatusBadge status={inv.status} /></td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          {inv.status === 'draft' && (
                            <button onClick={() => sendMutation.mutate(inv.id)} disabled={sendMutation.isPending}
                              className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                              발송
                            </button>
                          )}
                          {(inv.status === 'sent' || inv.status === 'overdue') && (
                            <button onClick={() => paidMutation.mutate(inv.id)} disabled={paidMutation.isPending}
                              className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                              결제확인
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
