import { useEffect, useRef, useCallback } from 'react'

type WsEvent = { event: string; data: unknown; timestamp: string }
type Handler = (data: unknown) => void

export function useWebSocket(url: string, handlers: Record<string, Handler>) {
  const ws = useRef<WebSocket | null>(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return

    ws.current = new WebSocket(url)

    ws.current.onopen = () => {
      console.debug('[WS] connected')
    }

    ws.current.onmessage = (e) => {
      try {
        const msg: WsEvent = JSON.parse(e.data)
        const handler = handlersRef.current[msg.event]
        if (handler) handler(msg.data)
      } catch {
        // ignore parse errors
      }
    }

    ws.current.onclose = () => {
      console.debug('[WS] disconnected — reconnecting in 3s')
      setTimeout(connect, 3_000)
    }

    ws.current.onerror = () => {
      ws.current?.close()
    }
  }, [url])

  useEffect(() => {
    connect()
    const ping = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send('ping')
      }
    }, 30_000)
    return () => {
      clearInterval(ping)
      ws.current?.close()
    }
  }, [connect])
}
