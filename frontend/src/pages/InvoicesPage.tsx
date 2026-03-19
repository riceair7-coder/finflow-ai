import React from 'react'
import { InvoiceTable } from '../components/invoices/InvoiceTable'

export function InvoicesPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">청구서 관리</h2>
        <p className="text-sm text-gray-500">청구서를 발행하고 결제를 추적하세요</p>
      </div>
      <InvoiceTable />
    </div>
  )
}
