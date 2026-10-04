from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.core.exceptions import NetSonicError
from app.schemas.sonification import (
    SonificationConfigResponse,
    SonificationConfigUpdate,
    SonificationStartRequest,
    SonificationStatusResponse,
)
from app.sonification.service import sonification_service


logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/sonification",
    tags=["sonification"],
)


@router.post("/start")
async def start_sonification(
    request: SonificationStartRequest,
):
    try:
        await sonification_service.start(
            request.interface_name
        )

        return {
            "message": "Sonification started.",
            "interface_name": request.interface_name,
        }

    except NetSonicError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception(
            "Unable to start sonification."
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to start sonification.",
        ) from exc


@router.post("/stop")
async def stop_sonification():
    try:
        await sonification_service.stop()

        return {
            "message": "Sonification stopped.",
        }

    except Exception as exc:
        logger.exception(
            "Unable to stop sonification."
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to stop sonification.",
        ) from exc


@router.get(
    "/status",
    response_model=SonificationStatusResponse,
)
async def get_sonification_status():
    return sonification_service.status()


@router.get(
    "/config",
    response_model=SonificationConfigResponse,
)
async def get_sonification_config():
    return {
        "min_frequency": 220.0,
        "max_frequency": 880.0,
        "min_volume": 0.04,
        "max_volume": 0.80,
        "min_pulse_rate": 0.5,
        "max_pulse_rate": 8.0,
        "max_peers": 4,
        "update_interval_ms": 100,
        "stereo_enabled": True,
    }


@router.put(
    "/config",
    response_model=SonificationConfigResponse,
)
async def update_sonification_config(
    config: SonificationConfigUpdate,
):
    if config.max_frequency <= config.min_frequency:
        raise HTTPException(
            status_code=400,
            detail=(
                "max_frequency must be greater than "
                "min_frequency."
            ),
        )

    if config.max_volume < config.min_volume:
        raise HTTPException(
            status_code=400,
            detail=(
                "max_volume must be greater than or "
                "equal to min_volume."
            ),
        )

    if config.max_pulse_rate < config.min_pulse_rate:
        raise HTTPException(
            status_code=400,
            detail=(
                "max_pulse_rate must be greater than or "
                "equal to min_pulse_rate."
            ),
        )

    return config.model_dump()


@router.websocket("/stream")
async def sonification_stream(
    websocket: WebSocket,
):
    await sonification_service.connect(websocket)

    try:
        # This is a server-to-client streaming endpoint.
        #
        # The sonification service sends updates independently
        # through its broadcast loop. The client does not need
        # to send application messages.
        #
        # Keep this coroutine alive until the client disconnects.
        while True:
            await asyncio.sleep(3600)

    except WebSocketDisconnect:
        logger.info(
            "Sonification WebSocket disconnected by client."
        )

    except Exception:
        logger.exception(
            "Sonification WebSocket handler failed."
        )

    finally:
        sonification_service.disconnect(websocket)