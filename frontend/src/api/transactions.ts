import { apiClient } from './client'

export interface Transaction {
  id: string
  external_id?: string
  transaction_date: string
  amount: number
  supply_amount?: number | null
  tax_amount?: number | null
  currency: string
  vendor_id?: string
  account_code?: string
  department_id?: string
  description?: string
  status: 'pending' | 'classified' | 'approved' | 'rejected'
  is_prepaid?: boolean
  paid_at?: string | null
  ai_classification_confidence?: number
  source: 'card' | 'bank' | 'manual' | 'ocr' | 'hometax'
  created_at: string
  updated_at: string
}

export interface TransactionCreate {
  transaction_date: string
  amount: number
  supply_amount?: number
  tax_amount?: number
  description?: string
  vendor_id?: string
  account_code?: string
  department_id?: string
  external_id?: string
  is_prepaid?: boolean
  paid_at?: string
  source?: Transaction['source']
}

export const transactionsApi = {
  list: (params?: {
    page?: number; limit?: number; status?: string; vendor_id?: string;
    department_id?: string; unassigned?: boolean;
    view?: 'unprocessed' | 'settled' | 'prepaid' | 'all';
    date_from?: string; date_to?: string;
    amount_min?: number; amount_max?: number;
    is_prepaid?: boolean;
    search?: string;
  }) =>
    apiClient.get<{ success: boolean; data: Transaction[]; meta: { total: number; page: number; limit: number; pages: number } }>('/api/v1/transactions', { params }),

  departmentCounts: () =>
    apiClient.get<{ success: boolean; data: { total: number; unassigned: number; by_department: Record<string, number> } }>('/api/v1/transactions/department-counts'),

  get: (id: string) =>
    apiClient.get<{ success: boolean; data: Transaction }>(`/api/v1/transactions/${id}`),

  create: (data: TransactionCreate) =>
    apiClient.post<{ success: boolean; data: Transaction }>('/api/v1/transactions', data),

  classify: (id: string, data: { account_code: string; vendor_id?: string; department_id?: string }) =>
    apiClient.patch<{ success: boolean; data: Transaction }>(`/api/v1/transactions/${id}/classify`, data),

  bulkClassify: () =>
    apiClient.post<{ success: boolean; data: { queued: number } }>('/api/v1/transactions/bulk-classify'),

  bulkSetPrepaid: (data: { tx_ids: string[]; is_prepaid: boolean; paid_at?: string }) =>
    apiClient.post<{ success: boolean; data: { updated: number; is_prepaid: boolean; paid_at?: string | null } }>(
      '/api/v1/transactions/bulk-set-prepaid', data,
    ),

  delete: (id: string) =>
    apiClient.delete<{ success: boolean; data: { id: string } }>(`/api/v1/transactions/${id}`),

  bulkDelete: (tx_ids: string[]) =>
    apiClient.post<{ success: boolean; data: { deleted: number } }>(
      '/api/v1/transactions/bulk-delete', { tx_ids },
    ),

  bulkAssignDepartment: (data: { tx_ids: string[]; department_id: string | null }) =>
    apiClient.post<{ success: boolean; data: { updated: number; department_id: string | null; vendors_updated: number } }>(
      '/api/v1/transactions/bulk-assign-department', data,
    ),

  importTaxInvoice: (file: File, options?: { is_prepaid?: boolean }) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<{
      success: boolean
      data: {
        imported: number
        skipped_duplicate: number
        skipped_invalid: number
        total_in_file: number
        summary: {
          buyer_brn: string
          buyer_name: string
          total_amount_sum: number
          supply_amount_sum: number
          tax_amount_sum: number
        }
      }
    }>('/api/v1/transactions/import-tax-invoice', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { is_prepaid: options?.is_prepaid ?? false },
    })
  },
}
