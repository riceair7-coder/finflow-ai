/**
 * 인증 정보 저장소.
 *
 * erp.zzixx.com 오리진을 여러 앱이 공유하기 때문에 예전의 access_token/current_user
 * 같은 범용 키는 다른 앱(delivery 등)과 충돌한다. finflow. 프리픽스로 격리하고,
 * 로그아웃 시 예전 키까지 정리한다.
 *
 * NOTE: localStorage는 XSS에 노출되는 저장소다. 근본 해결은 HttpOnly+Secure+SameSite
 * 쿠키로 옮기는 것이며(백엔드 세션 처리 필요), 이 모듈은 그 전 단계의 격리다.
 */
const TOKEN_KEY = 'finflow.access_token'
const USER_KEY = 'finflow.current_user'

/** 이 앱이 예전에 심었던 비-프리픽스 키 — 정리 대상 */
const LEGACY_KEYS = ['access_token', 'current_user']

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem('access_token')
}

export function getUserJson(): string | null {
  return localStorage.getItem(USER_KEY) ?? localStorage.getItem('current_user')
}

export function saveAuth(token: string, user: unknown) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  clearLegacy()
}

export function clearAuthStorage() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  clearLegacy()
}

/** 기존 로그인 세션을 끊지 않도록, 예전 키가 남아 있으면 새 키로 한 번 옮긴다 */
export function migrateLegacy() {
  const legacyToken = localStorage.getItem('access_token')
  const legacyUser = localStorage.getItem('current_user')
  if (legacyToken && !localStorage.getItem(TOKEN_KEY)) {
    localStorage.setItem(TOKEN_KEY, legacyToken)
  }
  if (legacyUser && !localStorage.getItem(USER_KEY)) {
    localStorage.setItem(USER_KEY, legacyUser)
  }
  if (legacyToken || legacyUser) clearLegacy()
}

function clearLegacy() {
  LEGACY_KEYS.forEach(k => localStorage.removeItem(k))
}
