import { apiClient } from './client'

export interface Invoice {
  id: string
  invoice_no: string
  vendor_id: string
  department_id?: string | null
  settlement_id?: string | null
  issue_date: string
  due_date: string
  subtotal: number
  tax_amount: number
  total_amount: number
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  sent_at?: string
  paid_at?: string
  notes?: string
  created_at: string
}

export const invoicesApi = {
  list: (params?: {
    page?: number; limit?: number; department_id?: string; unassigned?: boolean;
    status?: string; vendor_id?: string;
    date_from?: string; date_to?: string;
    amount_min?: number; amount_max?: number; search?: string;
  }) =>
    apiClient.get<{ success: boolean; data: Invoice[]; meta: { total: number; page: number; limit: number; pages: number } }>('/api/v1/invoices', { params }),

  departmentCounts: () =>
    apiClient.get<{ success: boolean; data: { total: number; unassigned: number; by_department: Record<string, number> } }>('/api/v1/invoices/department-counts'),

  statusCounts: () =>
    apiClient.get<{ success: boolean; data: { total: number; by_status: Record<string, number> } }>('/api/v1/invoices/status-counts'),

  bulkPay: (invoice_ids: string[]) =>
    apiClient.post<{ success: boolean; data: { updated: number } }>('/api/v1/invoices/bulk-pay', { invoice_ids }),

  bulkSend: (invoice_ids: string[]) =>
    apiClient.post<{ success: boolean; data: { updated: number } }>('/api/v1/invoices/bulk-send', { invoice_ids }),

  paymentSheetUrl: (invoice_ids: string[]) =>
    `/api/v1/invoices/payment-sheet?ids=${encodeURIComponent(invoice_ids.join(','))}`,

  exportXlsx: (params: Record<string, any>) =>
    apiClient.get('/api/v1/invoices/export-xlsx', { params, responseType: 'blob' }),

  delete: (id: string) =>
    apiClient.delete<{ success: boolean; data: { id: string } }>(`/api/v1/invoices/${id}`),

  cancel: (id: string) =>
    apiClient.patch<{ success: boolean; data: Invoice }>(`/api/v1/invoices/${id}/cancel`),

  postpone: (id: string, due_date?: string) =>
    apiClient.patch<{ success: boolean; data: Invoice }>(`/api/v1/invoices/${id}/postpone`, due_date ? { due_date } : {}),

  get: (id: string) =>
    apiClient.get<{ success: boolean; data: Invoice }>(`/api/v1/invoices/${id}`),

  send: (id: string) =>
    apiClient.post<{ success: boolean; data: Invoice }>(`/api/v1/invoices/${id}/send`),

  markPaid: (id: string) =>
    apiClient.patch<{ success: boolean; data: Invoice }>(`/api/v1/invoices/${id}/paid`),

  getAR: () =>
    apiClient.get<{ success: boolean; data: Invoice[] }>('/api/v1/ar'),

  getOverdue: () =>
    apiClient.get<{ success: boolean; data: Invoice[] }>('/api/v1/ar/overdue'),
}
