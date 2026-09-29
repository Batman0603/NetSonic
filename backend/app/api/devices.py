from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.device import Device
from app.schemas.device import DeviceListResponse, DeviceResponse

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