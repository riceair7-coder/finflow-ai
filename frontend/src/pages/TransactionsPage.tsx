import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { transactionsApi, type TransactionCreate } from '../api/transactions'
import { vendorsApi } from '../api/vendors'
import { departmentsApi } from '../api/departments'
import { STATUS_COLORS, STATUS_LABELS } from '../types'
import clsx from 'clsx'

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
  const [deptFilter, setDeptFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<TransactionCreate>({
    transaction_date: new Date().toISOString().slice(0, 10),
    amount: 0,
    description: '',
    source: 'manual',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', page, statusFilter, deptFilter],
    queryFn: () => transactionsApi.list({
      page, limit: 20,
      status: statusFilter || undefined,
      department_id: deptFilter || undefined,
    }),
  })
  const { data: vendorData } = useQuery({ queryKey: ['vendors-all'], queryFn: () => vendorsApi.list({ limit: 200 }) })
  const { data: deptData } = useQuery({ queryKey: ['departments'], queryFn: () => departmentsApi.list() })

  const vendors = vendorData?.data.data ?? []
  const departments = deptData?.data.data ?? []
  const vendorMap = Object.fromEntries(vendors.map(v => [v.id, v]))
  const deptMap = Object.fromEntries(departments.map(d => [d.id, d]))

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
            onClick={() => setShowAdd(true)}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            + 거래 등록
          </button>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-3">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm focus:border-blue-400 focus:outline-none">
          <option value="">전체 상태</option>
          <option value="pending">대기중</option>
          <option value="classified">분류완료</option>
          <option value="approved">승인됨</option>
          <option value="rejected">반려됨</option>
        </select>
        <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1) }}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm focus:border-blue-400 focus:outline-none">
          <option value="">전체 부서</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="px-5 py-3">날짜</th>
              <th className="px-5 py-3">설명</th>
              <th className="px-5 py-3">공급자</th>
              <th className="px-5 py-3">부서</th>
              <th className="px-5 py-3 text-right">금액</th>
              <th className="px-5 py-3">출처</th>
              <th className="px-5 py-3">상태</th>
              <th className="px-5 py-3">신뢰도</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-5 py-3.5"><div className="h-4 animate-pulse rounded bg-gray-100" /></td>
                  ))}</tr>
                ))
              : transactions.map(tx => {
                  const vendor = tx.vendor_id ? vendorMap[tx.vendor_id] : null
                  const dept = tx.department_id ? deptMap[tx.department_id] : null
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{tx.transaction_date}</td>
                      <td className="px-5 py-3.5 max-w-xs">
                        <span className="block truncate text-gray-900">{tx.description ?? '-'}</span>
                        {tx.account_code && <span className="text-xs text-gray-400">계정: {tx.account_code}</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {vendor
                          ? <div><p className="font-medium text-gray-900 text-xs">{vendor.name}</p>
                              <p className="text-xs text-gray-400 font-mono">{vendor.business_registration_no}</p></div>
                          : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-500">{dept?.name ?? '-'}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-gray-900">{fmt(tx.amount)}</td>
                      <td className="px-5 py-3.5">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{SOURCE_LABELS[tx.source] ?? tx.source}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[tx.status])}>
                          {STATUS_LABELS[tx.status]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
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
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">거래일자 *</label>
              <input type="date" value={form.transaction_date} onChange={set('transaction_date')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">금액 (원) *</label>
              <input type="number" value={form.amount || ''} onChange={set('amount')} placeholder="0"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">설명 (사업자번호 포함 시 자동 분류)</label>
              <input value={form.description ?? ''} onChange={set('description')}
                placeholder="예: AWS 서버비 사업자번호 123-45-67890"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">부서</label>
                <select value={form.department_id ?? ''} onChange={set('department_id')}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none">
                  <option value="">선택</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
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
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button onClick={() => setShowAdd(false)} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">취소</button>
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.amount}
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
