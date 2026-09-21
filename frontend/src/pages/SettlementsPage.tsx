import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SettlementTable, type SettlementExportFilters } from '../components/settlements/SettlementTable'
import { settlementsApi, type UnsettledVendor, type UnsettledTransaction } from '../api/settlements'
import { transactionsApi } from '../api/transactions'
import { vendorsApi, type Vendor } from '../api/vendors'
import { useAuthStore } from '../store/authStore'

function fmtKRW(n: number) { return `₩${n.toLocaleString('ko-KR')}` }

function Modal({
  title, onClose, children, size = 'md',
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  size?: 'md' | 'lg'
}) {
  const widthCls = size === 'lg' ? 'max-w-3xl' : 'max-w-xl'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className={`w-full ${widthCls} rounded-2xl bg-white shadow-2xl`}>
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
  unsettled, vendors, onBulkAll, onPickTransactions,
}: {
  unsettled: UnsettledVendor[]
  vendors: Vendor[]
  onBulkAll: (vendorIds: string[]) => void
  onPickTransactions: (vendorId: string) => void
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
            아직 어떤 정산에도 묶이지 않은 거래 — 총 {totalCount}건 · {fmtKRW(totalAmount)} ·
            <span className="ml-1 text-amber-700">카드 클릭 시 거래 단위로 선택해 정산</span>
          </p>
        </div>
        <button
          onClick={() => onBulkAll(unsettled.map(u => u.vendor_id))}
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
              onClick={() => onPickTransactions(u.vendor_id)}
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

function SelectTransactionsForm({
  vendorId, vendor, onClose,
}: {
  vendorId: string
  vendor: Vendor | undefined
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')

  const { data: txData, isLoading } = useQuery({
    queryKey: ['unsettled-transactions', vendorId],
    queryFn: () => settlementsApi.unsettledTransactions(vendorId),
    enabled: !!vendorId,
  })
  const transactions: UnsettledTransaction[] = txData?.data.data ?? []

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const allChecked = transactions.length > 0 && transactions.every(t => selected.has(t.id))
  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allChecked) transactions.forEach(t => next.delete(t.id))
      else transactions.forEach(t => next.add(t.id))
      return next
    })
  }

  const selectedTxs = transactions.filter(t => selected.has(t.id))
  const selectedTotal = selectedTxs.reduce((s, t) => s + t.amount, 0)

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['settlements'] })
    qc.invalidateQueries({ queryKey: ['settlements-dept-counts'] })
    qc.invalidateQueries({ queryKey: ['unsettled-by-vendor'] })
    qc.invalidateQueries({ queryKey: ['unsettled-transactions', vendorId] })
    qc.invalidateQueries({ queryKey: ['transactions'] })
  }

  // 선택 거래 전체를 한 건의 정산으로 묶음
  const createMutation = useMutation({
    mutationFn: () => settlementsApi.createFromTransactions({
      vendor_id: vendorId,
      transaction_ids: Array.from(selected),
      notes: notes.trim() || undefined,
    }),
    onSuccess: () => {
      invalidateAll()
      alert(`${selected.size}건의 거래로 정산이 생성되었습니다.`)
      onClose()
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '정산 생성 실패'),
  })

  // 선택 거래를 각각 개별 정산으로 생성 (같은 공급자여도 거래 1건당 정산 1건)
  const createIndividualMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected)
      const errors: string[] = []
      let ok = 0
      for (const id of ids) {
        try {
          await settlementsApi.createFromTransactions({
            vendor_id: vendorId,
            transaction_ids: [id],
            notes: notes.trim() || undefined,
          })
          ok += 1
        } catch (err: any) {
          errors.push(err?.response?.data?.detail ?? '알 수 없는 오류')
        }
      }
      return { ok, errors }
    },
    onSuccess: ({ ok, errors }) => {
      invalidateAll()
      if (errors.length === 0) {
        alert(`${ok}건의 거래를 각각 개별 정산으로 생성했습니다.`)
      } else {
        alert(`${ok}건 생성 완료, ${errors.length}건 실패\n- ${errors.slice(0, 5).join('\n- ')}`)
      }
      onClose()
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '정산 생성 실패'),
  })

  // 선택 거래를 사전입금으로 표시 (정산 대상에서 제외 → 목록에서 사라짐)
  const setPrepaidMutation = useMutation({
    mutationFn: (paid_at: string) => transactionsApi.bulkSetPrepaid({
      tx_ids: Array.from(selected),
      is_prepaid: true,
      paid_at,
    }),
    onSuccess: (res) => {
      // 표시 대상(선택)을 제외하고 이 공급자에 남는 미정산 거래
      const remaining = transactions.filter(t => !selected.has(t.id))
      invalidateAll()
      qc.invalidateQueries({ queryKey: ['transactions-dept-counts'] })
      alert(`${res.data.data.updated}건을 사전입금으로 표시했습니다.`)
      // 남은 거래가 없으면 창을 닫는다(정산 생성과 동일한 동작)
      if (remaining.length === 0) onClose()
      else setSelected(new Set())
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? '사전입금 표시 실패'),
  })

  const busy = createMutation.isPending || createIndividualMutation.isPending || setPrepaidMutation.isPending

  return (
    <div className="p-6 space-y-4">
      <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs">
        <span className="font-semibold text-gray-800">{vendor?.name ?? vendorId.slice(0, 8)}</span>
        {vendor?.business_registration_no && (
          <span className="ml-2 font-mono text-gray-500">{vendor.business_registration_no}</span>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>{transactions.length}건의 미정산 거래</span>
        <span>{selected.size}건 선택 · <span className="font-semibold text-amber-700">{fmtKRW(selectedTotal)}</span></span>
      </div>

      <div className="rounded-xl border border-gray-200 max-h-80 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-gray-50 px-3 py-2 text-xs">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            disabled={transactions.length === 0}
            className="h-4 w-4 cursor-pointer"
          />
          <span className="font-medium text-gray-700">전체 선택</span>
        </div>
        {isLoading ? (
          <p className="px-3 py-6 text-center text-xs text-gray-400">불러오는 중...</p>
        ) : transactions.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-gray-400">미정산 거래가 없습니다.</p>
        ) : (
          transactions.map(t => {
            const isChecked = selected.has(t.id)
            return (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-xs hover:bg-gray-50 ${isChecked ? 'bg-blue-50/40' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(t.id)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span className="w-24 text-gray-500">{t.transaction_date}</span>
                <span className="flex-1 truncate text-gray-800">{t.description || '(품목명 없음)'}</span>
                {t.external_id && (
                  <span className="font-mono text-gray-400">{t.external_id}</span>
                )}
                <span className="w-28 text-right font-semibold text-gray-900">{fmtKRW(t.amount)}</span>
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

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">취소</button>
        <button
          onClick={() => {
            const today = new Date().toISOString().slice(0, 10)
            const input = prompt(
              `선택한 ${selected.size}건을 사전입금으로 표시합니다.\n결제완료일을 입력하세요 (YYYY-MM-DD):`,
              today,
            )
            if (input === null) return
            const date = input.trim() || today
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { alert('날짜 형식 오류'); return }
            setPrepaidMutation.mutate(date)
          }}
          disabled={selected.size === 0 || busy}
          className="mr-auto rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {setPrepaidMutation.isPending ? '처리 중...' : `사전입금으로 표시 (${selected.size}건)`}
        </button>
        <button
          onClick={() => {
            if (selected.size > 1 && !confirm(`선택한 ${selected.size}건을 각각 개별 정산(${selected.size}건)으로 생성합니다. 진행할까요?`)) return
            createIndividualMutation.mutate()
          }}
          disabled={selected.size === 0 || busy}
          className="rounded-lg border border-blue-600 px-5 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
        >
          {createIndividualMutation.isPending ? '생성 중...' : `각각 개별 생성 (${selected.size}건)`}
        </button>
        <button
          onClick={() => createMutation.mutate()}
          disabled={selected.size === 0 || busy}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {createMutation.isPending ? '생성 중...' : `${selected.size}건으로 정산 생성`}
        </button>
      </div>
    </div>
  )
}

export function SettlementsPage() {
  const [showAdd, setShowAdd] = useState(false)
  // 목록에 적용 중인 검색/필터 — 엑셀 다운로드에 그대로 사용 (예전에는 빈 객체를 보내 전체가 받아졌다)
  const [exportFilters, setExportFilters] = useState<SettlementExportFilters>({ isPrepaidView: false })
  const [presetVendorIds, setPresetVendorIds] = useState<string[]>([])
  const [pickVendorId, setPickVendorId] = useState<string | null>(null)
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

  const filterCount = (Object.entries(exportFilters) as [string, unknown][])
    .filter(([k, v]) => k !== 'isPrepaidView' && v !== undefined && v !== '' && v !== false)
    .length

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
        <div className="flex items-center gap-2">
          {filterCount > 0 && !exportFilters.isPrepaidView && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
              필터 {filterCount}개 적용 — 조회 결과만 받습니다
            </span>
          )}
          <button
            onClick={async () => {
              try {
                const { isPrepaidView: _skip, ...params } = exportFilters
                const resp = await settlementsApi.exportXlsx(params)
                const url = URL.createObjectURL(resp.data as Blob)
                const a = document.createElement('a')
                a.href = url
                const suffix = filterCount > 0 ? '-filtered' : ''
                a.download = `settlements${suffix}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.xlsx`
                document.body.appendChild(a); a.click(); a.remove()
                URL.revokeObjectURL(url)
              } catch (e: any) {
                alert('엑셀 다운로드 실패: ' + (e?.message ?? ''))
              }
            }}
            disabled={exportFilters.isPrepaidView}
            title={exportFilters.isPrepaidView
              ? '사전입금 탭은 거래내역 기준이라 정산 엑셀로 내려받을 수 없습니다'
              : filterCount > 0 ? '현재 검색/필터가 적용된 정산만 내려받습니다' : '전체 정산을 내려받습니다'}
            className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
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

      <UnsettledCards
        unsettled={unsettled}
        vendors={vendors}
        onBulkAll={openModal}
        onPickTransactions={setPickVendorId}
      />

      <SettlementTable onFiltersChange={setExportFilters} />

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

      {pickVendorId && (
        <Modal title="거래 선택 정산" onClose={() => setPickVendorId(null)} size="lg">
          <SelectTransactionsForm
            vendorId={pickVendorId}
            vendor={vendors.find(v => v.id === pickVendorId)}
            onClose={() => setPickVendorId(null)}
          />
        </Modal>
      )}
    </div>
  )
}
