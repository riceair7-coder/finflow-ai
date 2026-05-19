import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { Vendor } from '../../api/vendors'

interface Props {
  vendors: Vendor[]
  value?: string  // vendor id
  onChange: (vendor: Vendor | null) => void
  placeholder?: string
  className?: string
}

/**
 * 검색 가능한 공급자 선택. 이름/사업자번호/대표자 어느 부분이든 입력하면 필터링.
 */
export function VendorSearchSelect({ vendors, value, onChange, placeholder = '공급자명·사업자번호·대표자로 검색', className }: Props) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => vendors.find(v => v.id === value) ?? null, [vendors, value])

  // 외부 클릭 시 닫기
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return vendors
    const digits = q.replace(/[^0-9]/g, '')
    return vendors.filter(v => {
      const name = (v.name ?? '').toLowerCase()
      const rep = (v.representative ?? '').toLowerCase()
      const brn = v.business_registration_no ?? ''
      if (name.includes(q) || rep.includes(q)) return true
      if (digits && brn.includes(digits)) return true
      return false
    })
  }, [vendors, search])

  const displayLabel = selected
    ? `${selected.name} (${selected.business_registration_no})`
    : ''

  return (
    <div ref={wrapRef} className={clsx('relative', className)}>
      <input
        type="text"
        value={open ? search : displayLabel}
        onChange={e => { setSearch(e.target.value); setOpen(true) }}
        onFocus={() => { setSearch(''); setOpen(true) }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
      {selected && !open && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(null); setSearch('') }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-xs text-gray-400 hover:bg-gray-100"
          title="선택 해제"
        >
          ✕
        </button>
      )}

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-400">검색 결과 없음</p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); setSearch('') }}
                className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 border-b"
              >
                — 선택 안 함 —
              </button>
              {filtered.slice(0, 100).map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => { onChange(v); setOpen(false); setSearch('') }}
                  className={clsx(
                    'w-full text-left px-3 py-2 text-sm hover:bg-blue-50',
                    v.id === value && 'bg-blue-50',
                  )}
                >
                  <div className="font-medium text-gray-900">{v.name}</div>
                  <div className="text-xs text-gray-500 font-mono">
                    {v.business_registration_no}
                    {v.representative && <span className="font-sans text-gray-400"> · 대표 {v.representative}</span>}
                  </div>
                </button>
              ))}
              {filtered.length > 100 && (
                <p className="px-3 py-2 text-xs text-gray-400 border-t">{filtered.length}건 중 상위 100건만 표시 — 더 좁히려면 키워드를 추가하세요</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
