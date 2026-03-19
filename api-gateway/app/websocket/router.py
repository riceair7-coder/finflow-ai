"""WebSocket 엔드포인트"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.websocket.manager import manager

router = APIRouter()


@router.websocket("/ws/dashboard")
async def dashboard_ws(ws: WebSocket):
    """대시보드 실시간 업데이트"""
    await manager.connect(ws)
    try:
        await manager.send_to(ws, "connected", {"connections": manager.connection_count})
        while True:
            # 클라이언트 ping 수신 대기 (연결 유지)
            data = await ws.receive_text()
            if data == "ping":
                await manager.send_to(ws, "pong", {})
    except WebSocketDisconnect:
        manager.disconnect(ws)
