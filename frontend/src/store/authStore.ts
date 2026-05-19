import { create } from 'zustand'
import type { User } from '../api/auth'

interface AuthState {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  clear: () => void
  hydrate: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,

  setAuth: (user, token) => {
    localStorage.setItem('access_token', token)
    localStorage.setItem('current_user', JSON.stringify(user))
    set({ user, token })
  },

  clear: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('current_user')
    set({ user: null, token: null })
  },

  hydrate: () => {
    const token = localStorage.getItem('access_token')
    const userJson = localStorage.getItem('current_user')
    if (token && userJson) {
      try {
        set({ user: JSON.parse(userJson), token })
      } catch {
        localStorage.removeItem('current_user')
      }
    }
  },
}))
