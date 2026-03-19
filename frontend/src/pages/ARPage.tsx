import React from 'react'
import { OverdueList } from '../components/ar/OverdueList'

export function ARPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">미수금 관리</h2>
        <p className="text-sm text-gray-500">연체 청구서를 추적하고 독촉하세요</p>
      </div>
      <OverdueList />
    </div>
  )
}
