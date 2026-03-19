"""WebSocket 연결 관리자 — 실시간 이벤트 브로드캐스트"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._active.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._active = [c for c in self._active if c is not ws]

    async def broadcast(self, event: str, data: Any) -> None:
        message = json.dumps(
            {"event": event, "data": data, "timestamp": datetime.now(timezone.utc).isoformat()}
        )
        dead: list[WebSocket] = []
        for ws in self._active:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def send_to(self, ws: WebSocket, event: str, data: Any) -> None:
        message = json.dumps(
            {"event": event, "data": data, "timestamp": datetime.now(timezone.utc).isoformat()}
        )
        await ws.send_text(message)

    @property
    def connection_count(self) -> int:
        return len(self._active)


manager = ConnectionManager()
