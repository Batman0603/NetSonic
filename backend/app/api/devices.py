from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.device import Device
from app.schemas.device import DeviceListResponse, DeviceResponse
from app.telemetry.service import device_history

router = APIRouter(prefix="/devices", tags=["Devices"])


@router.get("", response_model=DeviceListResponse)
def list_devices(
    db: Session = Depends(get_db),
) -> DeviceListResponse:
    """Return saved devices ordered by most recently observed."""

    devices = list(
        db.scalars(
            select(Device).order_by(Device.last_seen.desc())
        ).all()
    )

    return DeviceListResponse(
        devices=devices,
        total=len(devices),
    )


@router.get("/{device_id}", response_model=DeviceResponse)
def get_device(
    device_id: int,
    db: Session = Depends(get_db),
) -> Device:
    """Return one saved device by its database ID."""

    device = db.get(Device, device_id)

    if device is None:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found.",
        )

    return device


@router.get("/{device_id}/traffic")
def get_device_traffic(
    device_id: int,
    window: str = "24h",
    db: Session = Depends(get_db),
) -> dict:
    """Return historical packet and byte totals for one known device."""
    from fastapi import HTTPException, status
    from app.telemetry.service import WINDOWS

    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")
    if window not in WINDOWS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Window must be 5m, 1h, 24h, or 7d.")
    return {"device": DeviceResponse.model_validate(device), **device_history(db, device.ip_address, window)}
