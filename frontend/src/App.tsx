import React from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'

import { DashboardPage } from './pages/DashboardPage'
import { SettlementsPage } from './pages/SettlementsPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { ARPage } from './pages/ARPage'
import { VendorsPage } from './pages/VendorsPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { NotificationToastContainer } from './components/common/NotificationToast'
import { useWebSocket } from './hooks/useWebSocket'
import { useNotificationStore } from './store/notificationStore'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

const navItems = [
  { to: '/',            label: '대시보드',   icon: '◈',  end: true },
  { to: '/transactions', label: '거래 내역',  icon: '↔',  end: false },
  { to: '/settlements',  label: '정산 관리',  icon: '≡',  end: false },
  { to: '/invoices',     label: '청구서',     icon: '◻',  end: false },
  { to: '/ar',           label: '미수금',     icon: '⚠',  end: false },
  { to: '/vendors',      label: '공급자 관리', icon: '⊞', end: false },
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
        <nav className="flex-1 space-y-0.5 p-3">
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

        {/* 하단 */}
        <div className="border-t p-4">
          <div className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-center text-xs font-bold leading-7 text-white">관</div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-gray-700">관리자</p>
              <p className="truncate text-xs text-gray-400">admin</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}

function AppInner() {
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
            <Route path="/ar"           element={<ARPage />} />
            <Route path="/vendors"      element={<VendorsPage />} />
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
