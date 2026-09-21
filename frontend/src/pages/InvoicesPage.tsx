import { useState } from 'react'
import { InvoiceTable, type InvoiceExportFilters } from '../components/invoices/InvoiceTable'
import { invoicesApi } from '../api/invoices'

export function InvoicesPage() {
  // 목록에 적용 중인 검색/필터 — 엑셀 다운로드에 그대로 사용
  const [exportFilters, setExportFilters] = useState<InvoiceExportFilters>({})
  const filterCount = (Object.entries(exportFilters) as [string, unknown][])
    .filter(([, v]) => v !== undefined && v !== '' && v !== false)
    .length

  const downloadXlsx = async () => {
    try {
      const resp = await invoicesApi.exportXlsx(exportFilters)
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      const suffix = filterCount > 0 ? '-filtered' : ''
      a.download = `invoices${suffix}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.xlsx`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert('엑셀 다운로드 실패: ' + (e?.message ?? ''))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">청구서 관리</h2>
          <p className="text-sm text-gray-500">청구서를 발행하고 결제를 추적하세요</p>
        </div>
        <div className="flex items-center gap-2">
          {filterCount > 0 && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
              필터 {filterCount}개 적용 — 조회 결과만 받습니다
            </span>
          )}
          <button
            onClick={downloadXlsx}
            title={filterCount > 0 ? '현재 검색/필터가 적용된 청구서만 내려받습니다' : '전체 청구서를 내려받습니다'}
            className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            📊 엑셀 다운로드
          </button>
        </div>
      </div>
      <InvoiceTable onFiltersChange={setExportFilters} />
    </div>
  )
}
