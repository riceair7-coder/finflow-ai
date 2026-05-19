import { InvoiceTable } from '../components/invoices/InvoiceTable'
import { invoicesApi } from '../api/invoices'

export function InvoicesPage() {
  const downloadXlsx = async () => {
    try {
      const resp = await invoicesApi.exportXlsx({})
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoices-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.xlsx`
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
        <button
          onClick={downloadXlsx}
          className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
        >
          📊 엑셀 다운로드
        </button>
      </div>
      <InvoiceTable />
    </div>
  )
}
