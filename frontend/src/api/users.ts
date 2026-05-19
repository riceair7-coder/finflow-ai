import { apiClient } from './client'
import type { User, UserRole } from './auth'

export type { User, UserRole }

export interface UserCreate {
  email: string
  password: string
  name?: string
  department_id?: string
  role?: UserRole
  secondary_emails?: string[]
}

export interface UserUpdate {
  name?: string
  department_id?: string | null
  role?: UserRole
  is_active?: boolean
  password?: string
  // null/undefined면 변경 없음, []면 모두 삭제, list면 전체 교체
  secondary_emails?: string[]
}

export const usersApi = {
  list: (params?: { page?: number; limit?: number; is_active?: boolean; department_id?: string }) =>
    apiClient.get<{ success: boolean; data: User[]; meta: { total: number; page: number; limit: number; pages: number } }>('/api/v1/users', { params }),

  create: (data: UserCreate) =>
    apiClient.post<{ success: boolean; data: User }>('/api/v1/users', data),

  update: (id: string, data: UserUpdate) =>
    apiClient.patch<{ success: boolean; data: User }>(`/api/v1/users/${id}`, data),

  delete: (id: string) =>
    apiClient.delete<{ success: boolean; data: { id: string } }>(`/api/v1/users/${id}`),

  permanentDelete: (id: string) =>
    apiClient.delete<{ success: boolean; data: { id: string } }>(`/api/v1/users/${id}/permanent`),
}
