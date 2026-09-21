import { create } from 'zustand'
import type { WsStatus } from '../hooks/useWebSocket'

interface WsState {
  status: WsStatus
  retry: (() => void) | null
  setStatus: (s: WsStatus) => void
  setRetry: (fn: () => void) => void
}

/** 헤더 '실시간 연동' 배지가 실제 WebSocket 상태를 표시하도록 공유하는 스토어 */
export const useWsStore = create<WsState>((set) => ({
  status: 'connecting',
  retry: null,
  setStatus: (status) => set({ status }),
  setRetry: (retry) => set({ retry }),
}))
