import { create } from 'zustand'
import type { User } from '../api/auth'
import { clearAuthStorage, getToken, getUserJson, migrateLegacy, saveAuth } from '../api/authStorage'

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
    saveAuth(token, user)
    set({ user, token })
  },

  clear: () => {
    clearAuthStorage()
    set({ user: null, token: null })
  },

  hydrate: () => {
    migrateLegacy()
    const token = getToken()
    const userJson = getUserJson()
    if (token && userJson) {
      try {
        set({ user: JSON.parse(userJson), token })
      } catch {
        clearAuthStorage()
      }
    }
  },
}))
