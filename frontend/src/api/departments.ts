import { apiClient } from './client'

export interface Department {
  id: string
  code: string
  name: string
  cost_center?: string
  parent_id?: string
  is_active: boolean
}

export const departmentsApi = {
  list: (params?: { is_active?: boolean }) =>
    apiClient.get<{ success: boolean; data: Department[] }>('/api/v1/departments', { params }),

  create: (data: { code: string; name: string; cost_center?: string }) =>
    apiClient.post<{ success: boolean; data: Department }>('/api/v1/departments', data),

  update: (id: string, data: Partial<{ name: string; cost_center: string; is_active: boolean }>) =>
    apiClient.patch<{ success: boolean; data: Department }>(`/api/v1/departments/${id}`, data),

  delete: (id: string) =>
    apiClient.delete<{ success: boolean; data: { id: string } }>(`/api/v1/departments/${id}`),
}
