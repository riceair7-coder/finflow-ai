import { useState } from 'react'
import clsx from 'clsx'
import type { Vendor } from '../../api/vendors'

export interface SearchFilters {
  date_from?: string
  date_to?: string
  amount_min?: number
  amount_max?: number
  vendor_id?: string
  search?: string
}

interface Props {
  vendors: Vendor[]
  /** 적용된 필터 (검색 실행 시 갱신) */
  applied: SearchFilters
  /** "검색" 버튼 클릭 시 호출 */
  onApply: (filters: SearchFilters) => void
  /** 초기 펼침 여부 */
  defaultOpen?: boolean
  /** 날짜 라벨 (예: "작성일자", "정산기간", "발행일") */
  dateLabel?: string
  /** 키워드 검색 placeholder */
  searchPlaceholder?: string
}

export function SearchPanel({
  vendors, applied, onApply,
  defaultOpen = false,
  dateLabel = '날짜',
  searchPlaceholder = '키워드 검색...',
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [form, setForm] = useState<SearchFilters>(applied)

  // 활성화된 필터 카운트 (검색 패널이 닫혔을 때 배지)
  const activeCount = Object.entries(applied).filter(([, v]) =>
    v !== undefined && v !== '' && v !== null
  ).length

  const set = <K extends keyof SearchFilters>(k: K, v: SearchFilters[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const apply = () => {
    const cleaned: SearchFilters = {}
    if (form.date_from) cleaned.date_from = form.date_from
    if (form.date_to) cleaned.date_to = form.date_to
    if (form.amount_min !== undefined && !Number.isNaN(form.amount_min)) cleaned.amount_min = form.amount_min
    if (form.amount_max !== undefined && !Number.isNaN(form.amount_max)) cleaned.amount_max = form.amount_max
    if (form.vendor_id) cleaned.vendor_id = form.vendor_id
    if (form.search && form.search.trim()) cleaned.search = form.search.trim()
    onApply(cleaned)
  }

  const reset = () => {
    setForm({})
    onApply({})
  }

  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <span className="flex items-center gap-2">
          <span className="text-base">🔍</span>
          검색 / 필터
          {activeCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              {activeCount}개 적용중
            </span>
          )}
        </span>
        <span className={clsx('text-xs text-gray-400 transition-transform', open && 'rotate-180')}>▼</span>
      </button>

      {open && (
        <div className="border-t px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{dateLabel} 시작</label>
              <input
                type="date"
                value={form.date_from ?? ''}
                onChange={e => set('date_from', e.target.value || undefined)}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{dateLabel} 끝</label>
              <input
                type="date"
                value={form.date_to ?? ''}
                onChange={e => set('date_to', e.target.value || undefined)}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">최소 금액 (원)</label>
              <input
                type="number"
                value={form.amount_min ?? ''}
                onChange={e => set('amount_min', e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder="0"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">최대 금액 (원)</label>
              <input
                type="number"
                value={form.amount_max ?? ''}
                onChange={e => set('amount_max', e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder="제한 없음"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">공급자</label>
              <select
                value={form.vendor_id ?? ''}
                onChange={e => set('vendor_id', e.target.value || undefined)}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              >
                <option value="">전체 공급자</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name} ({v.business_registration_no})</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">키워드</label>
              <input
                type="text"
                value={form.search ?? ''}
                onChange={e => set('search', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && apply()}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-3">
            <button
              onClick={reset}
              className="rounded-lg px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              초기화
            </button>
            <button
              onClick={apply}
              className="rounded-lg bg-blue-600 px-5 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              검색
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
