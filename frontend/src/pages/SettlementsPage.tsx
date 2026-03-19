import React from 'react'
import { SettlementTable } from '../components/settlements/SettlementTable'

export function SettlementsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">정산 관리</h2>
        <p className="text-sm text-gray-500">거래처별 정산 현황을 확인하고 승인하세요</p>
      </div>
      <SettlementTable />
    </div>
  )
}
