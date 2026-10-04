from fastapi import APIRouter, HTTPException, Query

from app.core.exceptions import NetSonicError
from app.schemas.traffic import (
    TrafficSnapshotResponse,
    TrafficStartRequest,
    TrafficStartResponse,
    TrafficStatusResponse,
    TrafficStopResponse,
)
from app.traffic.service import traffic_monitor

router = APIRouter(
    prefix="/traffic",
    tags=["traffic"],
)


@router.post(
    "/start",
    response_model=TrafficStartResponse,
)
def start_traffic_monitoring(
    request: TrafficStartRequest,
):
    try:
        traffic_monitor.start(request.interface_name)

        return TrafficStartResponse(
            message="Traffic monitoring started.",
            interface_name=request.interface_name,
        )

    except NetSonicError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to start traffic monitoring.",
        ) from exc


@router.post(
    "/stop",
    response_model=TrafficStopResponse,
)
def stop_traffic_monitoring():
    try:
        traffic_monitor.stop()

        return TrafficStopResponse(
            message="Traffic monitoring stopped.",
        )

    except NetSonicError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to stop traffic monitoring.",
        ) from exc


@router.get(
    "/status",
    response_model=TrafficStatusResponse,
)
def get_traffic_status():
    try:
        return traffic_monitor.status()

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to read traffic monitoring status.",
        ) from exc


@router.get(
    "/snapshot",
    response_model=TrafficSnapshotResponse,
)
def get_traffic_snapshot(
    interface_name: str = Query(
        ...,
        min_length=1,
    ),
    window_seconds: int = Query(
        60,
        ge=1,
        le=300,
    ),
):
    try:
        return traffic_monitor.snapshot(
            interface_name=interface_name,
            window_seconds=window_seconds,
        )

    except NetSonicError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to read traffic metrics.",
        ) from exc