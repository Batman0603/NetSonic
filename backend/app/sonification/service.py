from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from app.core.exceptions import NetSonicError
from app.sonification.mapper import SonificationMapper


logger = logging.getLogger(__name__)


class SonificationService:
    """Coordinate real-time traffic sonification updates.

    Traffic metrics are obtained from the Phase 3 traffic monitor,
    converted into sonification parameters, and streamed to
    connected WebSocket clients.

    Audio playback itself is user initiated and runs in the browser.
    """

    UPDATE_INTERVAL_SECONDS = 0.1

    def __init__(self) -> None:
        self._enabled = False
        self._interface_name: str | None = None

        self._clients: set[WebSocket] = set()

        self._mapper = SonificationMapper()

        self._task: asyncio.Task[None] | None = None

    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def interface_name(self) -> str | None:
        return self._interface_name

    @property
    def connected_clients(self) -> int:
        return len(self._clients)

    async def start(
        self,
        interface_name: str,
    ) -> None:
        interface_name = interface_name.strip()

        if not interface_name:
            raise NetSonicError(
                "A network interface is required."
            )

        self._interface_name = interface_name
        self._enabled = True

        self._mapper.reset()

        if (
            self._task is None
            or self._task.done()
        ):
            self._task = asyncio.create_task(
                self._broadcast_loop()
            )

        logger.info(
            "Sonification started on interface '%s'.",
            interface_name,
        )

    async def stop(self) -> None:
        self._enabled = False
        self._interface_name = None

        if self._task is not None:
            self._task.cancel()

            try:
                await self._task

            except asyncio.CancelledError:
                pass

            self._task = None

        self._mapper.reset()

        logger.info(
            "Sonification stopped."
        )

    async def connect(
        self,
        websocket: WebSocket,
    ) -> None:
        await websocket.accept()

        self._clients.add(websocket)

        logger.info(
            "Sonification WebSocket connected. clients=%s",
            len(self._clients),
        )

    def disconnect(
        self,
        websocket: WebSocket,
    ) -> None:
        self._clients.discard(websocket)

        logger.info(
            "Sonification WebSocket disconnected. clients=%s",
            len(self._clients),
        )

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self._enabled,
            "interface_name": self._interface_name,
            "connected_clients": len(self._clients),
        }

    async def _broadcast_loop(self) -> None:
        while self._enabled:
            try:
                if (
                    self._interface_name
                    and self._clients
                ):
                    payload = self._build_payload()

                    await self._broadcast(
                        payload
                    )

                await asyncio.sleep(
                    self.UPDATE_INTERVAL_SECONDS
                )

            except asyncio.CancelledError:
                raise

            except Exception:
                logger.exception(
                    "Sonification broadcast loop failed."
                )

                await asyncio.sleep(
                    self.UPDATE_INTERVAL_SECONDS
                )

    def _build_payload(self) -> dict[str, Any]:
        if not self._interface_name:
            raise NetSonicError(
                "No network interface is selected."
            )

        # Local import avoids a circular dependency
        # during application startup.
        from app.traffic.service import traffic_monitor

        snapshot = traffic_monitor.snapshot(
            interface_name=self._interface_name,
            window_seconds=10,
        )

        mapped = self._mapper.map_snapshot(
            snapshot
        )

        payload = {
            "type": "sonification_update",
            "timestamp": datetime.now(
                timezone.utc
            ).isoformat(),
            "interface_name": self._interface_name,
            **mapped,
        }

        return self._serialize_datetimes(
            payload
        )

    @classmethod
    def _serialize_datetimes(
        cls,
        value: Any,
    ) -> Any:
        """
        Recursively convert datetime objects into
        ISO-8601 strings so the payload is JSON serializable.
        """

        if isinstance(value, datetime):
            return value.isoformat()

        if isinstance(value, dict):
            return {
                key: cls._serialize_datetimes(
                    item
                )
                for key, item in value.items()
            }

        if isinstance(value, list):
            return [
                cls._serialize_datetimes(item)
                for item in value
            ]

        if isinstance(value, tuple):
            return tuple(
                cls._serialize_datetimes(item)
                for item in value
            )

        return value

    async def _broadcast(
        self,
        payload: dict[str, Any],
    ) -> None:
        if not self._clients:
            return

        disconnected: list[WebSocket] = []

        for websocket in list(self._clients):
            try:
                await websocket.send_json(payload)

            except WebSocketDisconnect:
                logger.info(
                    "Sonification WebSocket client disconnected."
                )
                disconnected.append(websocket)

            except Exception:
                logger.exception(
                    "Failed to send sonification update "
                    "to WebSocket client."
                )
                disconnected.append(websocket)

        for websocket in disconnected:
            self.disconnect(websocket)


sonification_service = SonificationService()
