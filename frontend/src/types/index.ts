export interface PaginationMeta {
  total: number
  page: number
  limit: number
  pages: number
}

export interface ApiResponse<T> {
  success: boolean
  data: T | null
  error?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  meta: PaginationMeta
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
export type SettlementStatus = 'pending' | 'reviewing' | 'approved' | 'rejected' | 'paid'
export type TransactionStatus = 'pending' | 'classified' | 'approved' | 'rejected'

export const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  reviewing: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  paid: 'bg-emerald-100 text-emerald-800',
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-indigo-100 text-indigo-800',
  overdue: 'bg-red-100 text-red-800',
  classified: 'bg-purple-100 text-purple-800',
}

export const STATUS_LABELS: Record<string, string> = {
  pending: '대기중',
  reviewing: '검토중',
  approved: '승인됨',
  rejected: '반려됨',
  paid: '지급완료',
  draft: '초안',
  sent: '발송됨',
  overdue: '연체',
  classified: '분류완료',
}
