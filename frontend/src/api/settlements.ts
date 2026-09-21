import { apiClient } from './client'

export interface Settlement {
  id: string
  settlement_no: string
  vendor_id: string
  department_id?: string | null
  invoice_id?: string | null
  period_start: string
  period_end: string
  total_amount: number
  matched_transactions?: string[] | null
  status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'paid'
  notes?: string
  created_at: string
  updated_at: string
}

export interface UnsettledVendor {
  vendor_id: string
  department_id?: string | null
  count: number
  total_amount: number
  earliest_date?: string | null
  latest_date?: string | null
}

export interface PrepaidVendor {
  vendor_id: string
  department_id?: string | null
  count: number
  total_amount: number
  earliest_date?: string | null
  latest_date?: string | null
  earliest_paid_at?: string | null
  latest_paid_at?: string | null
}

export interface SettlementCreate {
  vendor_id: string
  period_start?: string
  period_end?: string
  notes?: string
}

export const settlementsApi = {
  list: (params?: {
    page?: number; limit?: number; status?: string;
    department_id?: string; unassigned?: boolean; vendor_id?: string;
    date_from?: string; date_to?: string;
    amount_min?: number; amount_max?: number; search?: string;
  }) =>
    apiClient.get<{ success: boolean; data: Settlement[]; meta: { total: number; page: number; limit: number; pages: number } }>('/api/v1/settlements', { params }),

  get: (id: string) =>
    apiClient.get<{ success: boolean; data: Settlement }>(`/api/v1/settlements/${id}`),

  create: (data: SettlementCreate) =>
    apiClient.post<{ success: boolean; data: Settlement }>('/api/v1/settlements', data),

  approve: (id: string, notes?: string) =>
    apiClient.patch<{ success: boolean; data: Settlement }>(`/api/v1/settlements/${id}/approve`, { notes }),

  reject: (id: string, notes?: string) =>
    apiClient.patch<{ success: boolean; data: Settlement }>(`/api/v1/settlements/${id}/reject`, { notes }),

  departmentCounts: () =>
    apiClient.get<{ success: boolean; data: { total: number; unassigned: number; by_department: Record<string, number> } }>('/api/v1/settlements/department-counts'),

  statusCounts: () =>
    apiClient.get<{ success: boolean; data: { total: number; by_status: Record<string, number> } }>('/api/v1/settlements/status-counts'),

  issueInvoice: (id: string) =>
    apiClient.post<{ success: boolean; data: { id: string; invoice_no: string; total_amount: number } }>(`/api/v1/settlements/${id}/issue-invoice`),

  bulkCreate: (data: { vendor_ids: string[]; period_start?: string; period_end?: string; notes?: string }) =>
    apiClient.post<{ success: boolean; data: Settlement[] }>('/api/v1/settlements/bulk-create', data),

  delete: (id: string) =>
    apiClient.delete<{ success: boolean; data: { id: string } }>(`/api/v1/settlements/${id}`),

  exportXlsx: (params: Record<string, any>) =>
    apiClient.get('/api/v1/settlements/export-xlsx', { params, responseType: 'blob' }),

  details: (id: string) =>
    apiClient.get<{
      success: boolean
      data: {
        settlement: Settlement
        transactions: Array<{
          id: string
          transaction_date: string
          external_id?: string | null
          description?: string | null
          vendor_id?: string | null
          amount: number
          supply_amount?: number | null
          tax_amount?: number | null
          is_prepaid: boolean
        }>
        invoice: null | {
          id: string
          invoice_no: string
          issue_date: string
          due_date: string
          subtotal: number
          tax_amount: number
          total_amount: number
          status: string
        }
        related_settlements: Array<{
          id: string
          settlement_no: string
          period_start: string
          period_end: string
          total_amount: number
        }>
      }
    }>(`/api/v1/settlements/${id}/details`),

  unsettledByVendor: () =>
    apiClient.get<{ success: boolean; data: UnsettledVendor[] }>('/api/v1/settlements/unsettled-by-vendor'),

  prepaidByVendor: () =>
    apiClient.get<{ success: boolean; data: PrepaidVendor[] }>('/api/v1/settlements/prepaid-by-vendor'),

  issueInvoiceFromSettlements: (data: { settlement_ids: string[]; notes?: string; due_date_days?: number }) =>
    apiClient.post<{ success: boolean; data: { id: string; invoice_no: string; total_amount: number } }>('/api/v1/settlements/issue-invoice', data),

  unsettledTransactions: (vendorId: string) =>
    apiClient.get<{ success: boolean; data: UnsettledTransaction[] }>(
      '/api/v1/settlements/unsettled-transactions',
      { params: { vendor_id: vendorId } },
    ),

  createFromTransactions: (data: { vendor_id: string; transaction_ids: string[]; notes?: string }) =>
    apiClient.post<{ success: boolean; data: Settlement }>(
      '/api/v1/settlements/create-from-transactions', data,
    ),

  attachmentCounts: () =>
    apiClient.get<{ success: boolean; data: Record<string, number> }>('/api/v1/settlements/attachment-counts'),

  listAttachments: (settlementId: string) =>
    apiClient.get<{ success: boolean; data: Attachment[] }>(`/api/v1/settlements/${settlementId}/attachments`),

  uploadAttachment: (settlementId: string, file: File, kind?: string) => {
    const fd = new FormData()
    fd.append('file', file)
    if (kind) fd.append('kind', kind)
    return apiClient.post<{ success: boolean; data: Attachment }>(
      `/api/v1/settlements/${settlementId}/attachments`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
  },

  downloadAttachment: (settlementId: string, attachmentId: string) =>
    apiClient.get(
      `/api/v1/settlements/${settlementId}/attachments/${attachmentId}/download`,
      { responseType: 'blob' },
    ),

  previewAttachment: (settlementId: string, attachmentId: string) =>
    apiClient.get<Blob>(
      `/api/v1/settlements/${settlementId}/attachments/${attachmentId}/preview`,
      { responseType: 'blob' },
    ),

  deleteAttachment: (settlementId: string, attachmentId: string) =>
    apiClient.delete<{ success: boolean; data: { id: string } }>(
      `/api/v1/settlements/${settlementId}/attachments/${attachmentId}`,
    ),
}

export interface UnsettledTransaction {
  id: string
  transaction_date: string
  external_id?: string | null
  description?: string | null
  amount: number
  supply_amount?: number | null
  tax_amount?: number | null
  department_id?: string | null
}

export interface Attachment {
  id: string
  settlement_id: string
  filename: string
  content_type?: string | null
  file_size: number
  kind?: string | null
  uploaded_by?: string | null
  uploaded_at?: string | null
}
