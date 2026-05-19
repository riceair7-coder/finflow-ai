import { apiClient } from './client'

export type UserRole = 'admin' | 'member'

export interface User {
  id: string
  email: string
  name?: string | null
  department_id?: string | null
  role: UserRole
  is_active: boolean
  last_login_at?: string | null
  created_at: string
  updated_at: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: User
}

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<{ success: boolean; data: LoginResponse }>('/api/v1/auth/login', { email, password }),

  me: () =>
    apiClient.get<{ success: boolean; data: User }>('/api/v1/auth/me'),
}
