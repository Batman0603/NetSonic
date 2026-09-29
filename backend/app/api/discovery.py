import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.discovery.service import (
    DiscoveryServiceError,
    discover_devices,
)
from app.schemas.network import (
    DiscoveryScanRequest,
    DiscoveryScanResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/discovery", tags=["Discovery"])


@router.post(
    "/scan",
    response_model=DiscoveryScanResponse,
    status_code=status.HTTP_200_OK,
)
def start_discovery_scan(
    request: DiscoveryScanRequest,
    db: Session = Depends(get_db),
) -> DiscoveryScanResponse:
    """Scan a selected local subnet and save responding devices."""

    try:
        subnet, devices = discover_devices(
            db=db,
            interface_name=request.interface_name,
            requested_subnet=request.subnet,
        )
    except DiscoveryServiceError as exc:
        logger.warning("Discovery request rejected: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return DiscoveryScanResponse(
        interface_name=request.interface_name,
        subnet=subnet,
        discovered_count=len(devices),
        devices=devices,
    )