import axios from 'axios'
import { clearAuthStorage, getToken } from './authStorage'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 토큰 만료/무효 — 로컬 인증 정보 비우고 메인으로. LoginPage가 자동 렌더링됨.
      const hadToken = !!getToken()
      clearAuthStorage()
      if (hadToken) {
        window.location.href = window.location.origin + '/finflow/'
      }
    }
    return Promise.reject(error)
  },
)
