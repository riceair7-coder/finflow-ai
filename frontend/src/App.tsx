import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'

import { DashboardPage } from './pages/DashboardPage'
import { SettlementsPage } from './pages/SettlementsPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { VendorsPage } from './pages/VendorsPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { DepartmentsPage } from './pages/DepartmentsPage'
import { UsersPage } from './pages/UsersPage'
import { LoginPage } from './pages/LoginPage'
import { NotificationToastContainer } from './components/common/NotificationToast'
import { ChangePasswordModal } from './components/auth/ChangePasswordModal'
import { useWebSocket } from './hooks/useWebSocket'
import { useNotificationStore } from './store/notificationStore'
import { useAuthStore } from './store/authStore'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

const baseNav = [
  { to: '/',            label: '대시보드',   icon: '◈',  end: true,  adminOnly: false },
  { to: '/transactions', label: '거래 내역',  icon: '↔',  end: false, adminOnly: false },
  { to: '/settlements',  label: '정산 관리',  icon: '≡',  end: false, adminOnly: false },
  { to: '/invoices',     label: '청구서',     icon: '◻',  end: false, adminOnly: false },
  { to: '/vendors',      label: '공급자 관리', icon: '⊞', end: false, adminOnly: true },
  { to: '/departments',  label: '부서 관리',   icon: '▦',  end: false, adminOnly: true },
  { to: '/users',        label: '사용자 관리', icon: '⎔',  end: false, adminOnly: true },
]

function RealtimeHandler() {
  const addNotification = useNotificationStore(s => s.add)
  const qc = useQueryClient()
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8000/ws/dashboard`

  useWebSocket(wsUrl, {
    settlement_approved: (data: any) => {
      addNotification({ type: 'success', title: '정산 승인됨', message: `${data.settlement_no} — ₩${Number(data.total_amount).toLocaleString()}` })
      qc.invalidateQueries({ queryKey: ['settlements'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
    settlement_rejected: (data: any) => {
      addNotification({ type: 'warning', title: '정산 반려됨', message: data.settlement_no })
      qc.invalidateQueries({ queryKey: ['settlements'] })
    },
  })
  return null
}

function Layout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const clearAuth = useAuthStore(s => s.clear)
  const isAdmin = user?.role === 'admin'
  const navItems = baseNav.filter(n => !n.adminOnly || isAdmin)
  const [showChangePassword, setShowChangePassword] = useState(false)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-56 flex-col border-r bg-white shadow-sm">
        {/* 로고 */}
        <div className="border-b px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">FF</div>
            <div>
              <h1 className="text-sm font-bold text-gray-900">FinFlow AI</h1>
              <p className="text-xs text-gray-400">재무 자동화</p>
            </div>
          </div>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 space-y-0.5 p-3 overflow-y-auto">
          {navItems.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                }`
              }
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* 하단: 사용자 정보 + 로그아웃 */}
        <div className="border-t p-4 space-y-2">
          <div className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-center text-xs font-bold leading-7 text-white">
              {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-700">{user?.name || user?.email}</p>
              <p className="truncate text-xs text-gray-400">{user?.role ?? '-'}</p>
            </div>
          </div>
          <button
            onClick={() => setShowChangePassword(true)}
            className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            비밀번호 변경
          </button>
          <button
            onClick={() => {
              clearAuth()
              window.location.href = window.location.origin + '/'
            }}
            className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            로그아웃
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  )
}

function AppInner() {
  const user = useAuthStore(s => s.user)
  const hydrate = useAuthStore(s => s.hydrate)
  const isAdmin = user?.role === 'admin'

  useEffect(() => { hydrate() }, [hydrate])

  if (!user) {
    return (
      <>
        <LoginPage />
        <NotificationToastContainer />
      </>
    )
  }

  return (
    <>
      <RealtimeHandler />
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/"             element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/settlements"  element={<SettlementsPage />} />
            <Route path="/invoices"     element={<InvoicesPage />} />
            {isAdmin && <Route path="/vendors"      element={<VendorsPage />} />}
            {isAdmin && <Route path="/departments"  element={<DepartmentsPage />} />}
            {isAdmin && <Route path="/users"        element={<UsersPage />} />}
          </Routes>
        </Layout>
      </BrowserRouter>
      <NotificationToastContainer />
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  )
}
