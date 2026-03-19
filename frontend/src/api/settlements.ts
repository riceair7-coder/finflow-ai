import { apiClient } from './client'

export interface Settlement {
  id: string
  settlement_no: string
  vendor_id: string
  period_start: string
  period_end: string
  total_amount: number
  status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'paid'
  notes?: string
  created_at: string
  updated_at: string
}

export interface SettlementCreate {
  vendor_id: string
  period_start: string
  period_end: string
  notes?: string
}

export const settlementsApi = {
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    apiClient.get<{ success: boolean; data: Settlement[]; meta: { total: number; page: number; limit: number; pages: number } }>('/api/v1/settlements', { params }),

  get: (id: string) =>
    apiClient.get<{ success: boolean; data: Settlement }>(`/api/v1/settlements/${id}`),

  create: (data: SettlementCreate) =>
    apiClient.post<{ success: boolean; data: Settlement }>('/api/v1/settlements', data),

  approve: (id: string, notes?: string) =>
    apiClient.patch<{ success: boolean; data: Settlement }>(`/api/v1/settlements/${id}/approve`, { notes }),

  reject: (id: string, notes?: string) =>
    apiClient.patch<{ success: boolean; data: Settlement }>(`/api/v1/settlements/${id}/reject`, { notes }),
}
