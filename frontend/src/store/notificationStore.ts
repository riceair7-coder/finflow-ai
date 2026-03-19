import { create } from 'zustand'

export interface Notification {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message: string
  createdAt: Date
}

interface NotificationStore {
  notifications: Notification[]
  add: (n: Omit<Notification, 'id' | 'createdAt'>) => void
  remove: (id: string) => void
  clear: () => void
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  add: (n) =>
    set((state) => ({
      notifications: [
        { ...n, id: crypto.randomUUID(), createdAt: new Date() },
        ...state.notifications,
      ].slice(0, 20), // 최대 20개
    })),
  remove: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
  clear: () => set({ notifications: [] }),
}))
