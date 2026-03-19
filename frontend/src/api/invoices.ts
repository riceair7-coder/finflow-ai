import { apiClient } from './client'

export interface Invoice {
  id: string
  invoice_no: string
  vendor_id: string
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
  list: (params?: { page?: number; limit?: number }) =>
    apiClient.get<{ success: boolean; data: Invoice[] }>('/api/v1/invoices', { params }),

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
