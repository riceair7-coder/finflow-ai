import { useCallback, useEffect, useRef, useState } from 'react'

type WsEvent = { event: string; data: unknown; timestamp: string }
type Handler = (data: unknown) => void

export type WsStatus = 'connecting' | 'open' | 'closed' | 'failed'

const BASE_DELAY_MS = 3_000
const MAX_DELAY_MS = 60_000
const MAX_ATTEMPTS = 8

/**
 * 재연결은 지수 백오프(3s→6s→12s…최대 60s)로 하고, MAX_ATTEMPTS 회 실패하면
 * 'failed'로 확정해 더 시도하지 않는다. 예전에는 3초 고정·무한 재시도라
 * 서버 라우트가 없을 때 콘솔과 네트워크를 계속 두드렸다.
 */
export function useWebSocket(url: string, handlers: Record<string, Handler>) {
  const ws = useRef<WebSocket | null>(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const attempts = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closedByUs = useRef(false)
  const [status, setStatus] = useState<WsStatus>('connecting')

  const connect = useCallback(() => {
    if (closedByUs.current) return
    if (ws.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch {
      setStatus('failed')
      return
    }
    ws.current = socket

    socket.onopen = () => {
      attempts.current = 0
      setStatus('open')
    }

    socket.onmessage = (e) => {
      try {
        const msg: WsEvent = JSON.parse(e.data)
        const handler = handlersRef.current[msg.event]
        if (handler) handler(msg.data)
      } catch {
        // ignore parse errors
      }
    }

    socket.onclose = () => {
      if (closedByUs.current) return
      attempts.current += 1
      if (attempts.current > MAX_ATTEMPTS) {
        console.warn(`[WS] ${MAX_ATTEMPTS}회 재연결 실패 — 실시간 연동을 중단합니다`)
        setStatus('failed')
        return
      }
      const delay = Math.min(BASE_DELAY_MS * 2 ** (attempts.current - 1), MAX_DELAY_MS)
      setStatus('closed')
      timer.current = setTimeout(connect, delay)
    }

    socket.onerror = () => {
      socket.close()
    }
  }, [url])

  useEffect(() => {
    closedByUs.current = false
    attempts.current = 0
    connect()
    const ping = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send('ping')
      }
    }, 30_000)
    return () => {
      closedByUs.current = true
      clearInterval(ping)
      if (timer.current) clearTimeout(timer.current)
      ws.current?.close()
    }
  }, [connect])

  const retry = useCallback(() => {
    attempts.current = 0
    connect()
  }, [connect])

  return { status, retry }
}
