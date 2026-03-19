import { apiClient } from './client'

export interface Vendor {
  id: string
  business_registration_no: string
  name: string
  representative?: string
  address?: string
  phone?: string
  email?: string
  bank_info?: Record<string, string>
  payment_terms_days: number
  credit_limit?: number
  department_id?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface VendorCreate {
  business_registration_no: string
  name: string
  representative?: string
  address?: string
  phone?: string
  email?: string
  payment_terms_days?: number
  credit_limit?: number
  department_id?: string
}

export const vendorsApi = {
  list: (params?: { page?: number; limit?: number; department_id?: string; search?: string; is_active?: boolean }) =>
    apiClient.get<{ success: boolean; data: Vendor[]; meta: { total: number; page: number; limit: number; pages: number } }>('/api/v1/vendors', { params }),

  get: (id: string) =>
    apiClient.get<{ success: boolean; data: Vendor }>(`/api/v1/vendors/${id}`),

  create: (data: VendorCreate) =>
    apiClient.post<{ success: boolean; data: Vendor }>('/api/v1/vendors', data),

  update: (id: string, data: Partial<VendorCreate> & { is_active?: boolean }) =>
    apiClient.patch<{ success: boolean; data: Vendor }>(`/api/v1/vendors/${id}`, data),

  delete: (id: string) =>
    apiClient.delete<{ success: boolean; data: { id: string } }>(`/api/v1/vendors/${id}`),

  lookupByBRN: (brn: string) =>
    apiClient.get<{ success: boolean; data: Vendor }>(`/api/v1/vendors/lookup/by-brn/${brn}`),
}
