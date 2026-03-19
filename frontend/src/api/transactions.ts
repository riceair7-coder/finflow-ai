import { apiClient } from './client'

export interface Transaction {
  id: string
  external_id?: string
  transaction_date: string
  amount: number
  currency: string
  vendor_id?: string
  account_code?: string
  department_id?: string
  description?: string
  status: 'pending' | 'classified' | 'approved' | 'rejected'
  ai_classification_confidence?: number
  source: 'card' | 'bank' | 'manual' | 'ocr' | 'hometax'
  created_at: string
  updated_at: string
}

export interface TransactionCreate {
  transaction_date: string
  amount: number
  description?: string
  vendor_id?: string
  account_code?: string
  department_id?: string
  source?: Transaction['source']
}

export const transactionsApi = {
  list: (params?: { page?: number; limit?: number; status?: string; vendor_id?: string; department_id?: string }) =>
    apiClient.get<{ success: boolean; data: Transaction[]; meta: { total: number; page: number; limit: number; pages: number } }>('/api/v1/transactions', { params }),

  get: (id: string) =>
    apiClient.get<{ success: boolean; data: Transaction }>(`/api/v1/transactions/${id}`),

  create: (data: TransactionCreate) =>
    apiClient.post<{ success: boolean; data: Transaction }>('/api/v1/transactions', data),

  classify: (id: string, data: { account_code: string; vendor_id?: string; department_id?: string }) =>
    apiClient.patch<{ success: boolean; data: Transaction }>(`/api/v1/transactions/${id}/classify`, data),

  bulkClassify: () =>
    apiClient.post<{ success: boolean; data: { queued: number } }>('/api/v1/transactions/bulk-classify'),
}
