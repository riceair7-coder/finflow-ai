import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'

// 라우트 단위 코드 스플리팅 — 예전에는 전 화면이 단일 번들이라 첫 로딩이 무거웠다
const DashboardPage    = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const SettlementsPage  = lazy(() => import('./pages/SettlementsPage').then(m => ({ default: m.SettlementsPage })))
const InvoicesPage     = lazy(() => import('./pages/InvoicesPage').then(m => ({ default: m.InvoicesPage })))
const VendorsPage      = lazy(() => import('./pages/VendorsPage').then(m => ({ default: m.VendorsPage })))
const TransactionsPage = lazy(() => import('./pages/TransactionsPage').then(m => ({ default: m.TransactionsPage })))
const DepartmentsPage  = lazy(() => import('./pages/DepartmentsPage').then(m => ({ default: m.DepartmentsPage })))
const UsersPage        = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })))

import { LoginPage } from './pages/LoginPage'
import { NotificationToastContainer } from './components/common/NotificationToast'
import { ChangePasswordModal } from './components/auth/ChangePasswordModal'
import { useWebSocket } from './hooks/useWebSocket'
import { useNotificationStore } from './store/notificationStore'
import { useAuthStore } from './store/authStore'
import { useWsStore } from './store/wsStore'

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
  const setWsStatus = useWsStore(s => s.setStatus)
  const setWsRetry = useWsStore(s => s.setRetry)
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/finflow/ws/dashboard`

  const { status, retry } = useWebSocket(wsUrl, {
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

  useEffect(() => { setWsStatus(status) }, [status, setWsStatus])
  useEffect(() => { setWsRetry(retry) }, [retry, setWsRetry])

  return null
}

/** 화면 전환 시 흰 화면 대신 보여줄 스켈레톤 */
function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="불러오는 중">
      <div className="h-7 w-48 animate-pulse rounded-lg bg-gray-100" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />)}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
    </div>
  )
}

function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-5xl font-bold text-gray-200">404</p>
      <h2 className="text-lg font-semibold text-gray-800">페이지를 찾을 수 없습니다</h2>
      <p className="max-w-md text-sm text-gray-500">
        주소가 바뀌었거나 권한이 없는 화면일 수 있습니다. 왼쪽 메뉴에서 다시 선택해 주세요.
      </p>
      <Link
        to="/"
        className="mt-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        대시보드로 이동
      </Link>
    </div>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const clearAuth = useAuthStore(s => s.clear)
  const isAdmin = user?.role === 'admin'
  const navItems = baseNav.filter(n => !n.adminOnly || isAdmin)
  const [showChangePassword, setShowChangePassword] = useState(false)

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* sticky — 긴 목록을 스크롤해도 메뉴가 따라오도록 */}
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r bg-white shadow-sm">
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
              window.location.href = window.location.origin + '/finflow/'
            }}
            className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            로그아웃
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
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
      <BrowserRouter basename="/finflow">
        <Layout>
          <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/"             element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/settlements"  element={<SettlementsPage />} />
            <Route path="/invoices"     element={<InvoicesPage />} />
            {isAdmin && <Route path="/vendors"      element={<VendorsPage />} />}
            {isAdmin && <Route path="/departments"  element={<DepartmentsPage />} />}
            {isAdmin && <Route path="/users"        element={<UsersPage />} />}
            {/* 메뉴 라벨이 '공급자 관리'라 /suppliers로 찾아오는 경우가 있어 별칭 유지 */}
            <Route path="/suppliers" element={<Navigate to="/vendors" replace />} />
            {/* 잘못된 주소가 흰 화면이 되지 않도록 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          </Suspense>
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
