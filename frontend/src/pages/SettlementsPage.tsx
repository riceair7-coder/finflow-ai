import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SettlementTable } from '../components/settlements/SettlementTable'
import { settlementsApi, type UnsettledVendor } from '../api/settlements'
import { vendorsApi, type Vendor } from '../api/vendors'
import { useAuthStore } from '../store/authStore'

function fmtKRW(n: number) { return `₩${n.toLocaleString('ko-KR')}` }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function BulkCreateForm({
  vendors, unsettled, preselectedVendorIds, onClose,
}: {
  vendors: Vendor[]
  unsettled: UnsettledVendor[]
  preselectedVendorIds?: string[]
  onClose: () => void
}) {
  const qc = useQueryClient()

  const [selected, setSelected] = useState<Set<string>>(new Set(preselectedVendorIds ?? []))
  const [notes, setNotes] = useState('')
  const [onlyUnsettled, setOnlyUnsettled] = useState(true)

  const unsettledVendorSet = useMemo(() => new Set(unsettled.map(u => u.vendor_id)), [unsettled])
  const unsettledAmountMap = useMemo(
    () => Object.fromEntries(unsettled.map(u => [u.vendor_id, u])),
    [unsettled],
  )

  const filteredVendors = onlyUnsettled
    ? vendors.filter(v => unsettledVendorSet.has(v.id))
    : vendors

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    const allIds = filteredVendors.map(v => v.id)
    const allSelected = allIds.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) allIds.forEach(id => next.delete(id))
      else allIds.forEach(id => next.add(id))
      return next
    })
  }

  const createMutation = useMutation({
    mutationFn: () => settlementsApi.bulkCreate({
      vendor_ids: Array.from(selected),
      notes: notes.trim() || undefined,
    }),
    onSuccess: (res) => {
      const created = res.data.data
      qc.invalidateQueries({ queryKey: ['settlements'] })
      qc.invalidateQueries({ queryKey: ['settlements-dept-counts'] })
      qc.invalidateQueries({ queryKey: ['unsettled-by-vendor'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      alert(`${created.length}건의 정산이 생성되었습니다.`)
      onClose()
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '일괄 생성 실패'),
  })

  const canSubmit = selected.size > 0
  const allIds = filteredVendors.map(v => v.id)
  const allChecked = allIds.length > 0 && allIds.every(id => selected.has(id))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={onlyUnsettled} onChange={e => setOnlyUnsettled(e.target.checked)} />
          미정산 거래가 있는 공급자만 표시
        </label>
        <span className="text-xs text-gray-500">{selected.size}곳 선택됨 / {filteredVendors.length}곳</span>
      </div>

      <div className="rounded-xl border border-gray-200 max-h-72 overflow-y-auto">
        <div className="sticky top-0 flex items-center gap-2 border-b bg-gray-50 px-3 py-2 text-xs">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 cursor-pointer" />
          <span className="font-medium text-gray-700">전체 선택</span>
        </div>
        {filteredVendors.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-gray-400">표시할 공급자가 없습니다.</p>
        ) : (
          filteredVendors.map(v => {
            const us = unsettledAmountMap[v.id]
            const isChecked = selected.has(v.id)
            return (
              <label
                key={v.id}
                className={`flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-xs hover:bg-gray-50 ${isChecked ? 'bg-blue-50/40' : ''}`}
              >
                <input type="checkbox" checked={isChecked} onChange={() => toggle(v.id)} className="h-4 w-4 cursor-pointer" />
                <span className="flex-1 truncate font-medium text-gray-800">{v.name}</span>
                <span className="text-gray-400 font-mono">{v.business_registration_no}</span>
                {us && (
                  <span className="rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                    미정산 {us.count}건 · {fmtKRW(us.total_amount)}
                  </span>
                )}
              </label>
            )
          })
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">메모 (선택)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
      </div>

      <div className="rounded-lg bg-blue-50/50 px-3 py-2 text-xs text-gray-600">
        선택한 공급자의 <b>미정산</b>(사전입금이 아니고 어떤 정산에도 묶이지 않은) 거래 전체가 자동으로 묶입니다.
        정산기간은 매칭된 거래의 최저~최고 일자로 자동 설정됩니다.
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">취소</button>
        <button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {createMutation.isPending ? '생성 중...' : `${selected.size}건 일괄 생성`}
        </button>
      </div>
    </div>
  )
}

function UnsettledCards({
  unsettled, vendors, onCreateFor,
}: {
  unsettled: UnsettledVendor[]
  vendors: Vendor[]
  onCreateFor: (vendorIds: string[]) => void
}) {
  const vendorMap = useMemo(() => Object.fromEntries(vendors.map(v => [v.id, v])), [vendors])
  if (!unsettled.length) return null

  const totalAmount = unsettled.reduce((s, u) => s + u.total_amount, 0)
  const totalCount = unsettled.reduce((s, u) => s + u.count, 0)

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-amber-900">미정산 공급자 ({unsettled.length}곳)</h3>
          <p className="mt-0.5 text-xs text-amber-800">
            아직 어떤 정산에도 묶이지 않은 거래 — 총 {totalCount}건 · {fmtKRW(totalAmount)}
          </p>
        </div>
        <button
          onClick={() => onCreateFor(unsettled.map(u => u.vendor_id))}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
        >
          전체 일괄 정산
        </button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
        {unsettled.map(u => {
          const v = vendorMap[u.vendor_id]
          return (
            <button
              key={u.vendor_id}
              onClick={() => onCreateFor([u.vendor_id])}
              className="flex flex-col rounded-xl border bg-white px-3 py-2 text-left text-xs hover:border-amber-400 hover:shadow-sm"
            >
              <span className="truncate font-medium text-gray-900">{v?.name ?? u.vendor_id.slice(0, 8)}</span>
              <span className="text-gray-400 font-mono">{v?.business_registration_no ?? '-'}</span>
              <span className="mt-1 text-gray-600">
                {u.count}건 · <span className="font-semibold text-amber-700">{fmtKRW(u.total_amount)}</span>
              </span>
              {u.earliest_date && u.latest_date && (
                <span className="text-gray-400">{u.earliest_date} ~ {u.latest_date}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function SettlementsPage() {
  const [showAdd, setShowAdd] = useState(false)
  const [presetVendorIds, setPresetVendorIds] = useState<string[]>([])
  const me = useAuthStore(s => s.user)

  // member는 본인 부서 vendor만
  const { data: vendorData } = useQuery({
    queryKey: ['vendors-for-settlement', me?.role, me?.department_id],
    queryFn: () => vendorsApi.list({
      limit: 200,
      department_id: me?.role !== 'admin' && me?.department_id ? me.department_id : undefined,
    }),
  })
  const vendors = vendorData?.data.data ?? []

  const { data: unsettledData } = useQuery({
    queryKey: ['unsettled-by-vendor'],
    queryFn: () => settlementsApi.unsettledByVendor(),
  })
  const unsettled = unsettledData?.data.data ?? []

  const openModal = (vendorIds: string[]) => {
    setPresetVendorIds(vendorIds)
    setShowAdd(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">정산 관리</h2>
          <p className="text-sm text-gray-500">거래처별 정산 현황을 확인하고 승인하세요</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              try {
                const resp = await settlementsApi.exportXlsx({})
                const url = URL.createObjectURL(resp.data as Blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `settlements-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.xlsx`
                document.body.appendChild(a); a.click(); a.remove()
                URL.revokeObjectURL(url)
              } catch (e: any) {
                alert('엑셀 다운로드 실패: ' + (e?.message ?? ''))
              }
            }}
            className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            📊 엑셀 다운로드
          </button>
          <button
            onClick={() => openModal([])}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            + 정산 등록
          </button>
        </div>
      </div>

      <UnsettledCards unsettled={unsettled} vendors={vendors} onCreateFor={openModal} />

      <SettlementTable />

      {showAdd && (
        <Modal title="정산 일괄 등록" onClose={() => setShowAdd(false)}>
          <BulkCreateForm
            vendors={vendors}
            unsettled={unsettled}
            preselectedVendorIds={presetVendorIds}
            onClose={() => setShowAdd(false)}
          />
        </Modal>
      )}
    </div>
  )
}
