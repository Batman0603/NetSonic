import logging

from fastapi import APIRouter, HTTPException, status

from app.discovery.interfaces import (
    InterfaceDiscoveryError,
    list_ipv4_interfaces,
)
from app.schemas.network import (
    InterfaceListResponse,
    NetworkInterfaceResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/interfaces", tags=["Network Interfaces"])


@router.get("", response_model=InterfaceListResponse)
def get_interfaces() -> InterfaceListResponse:
    """List local IPv4 interfaces available for discovery."""

    try:
        interfaces = list_ipv4_interfaces()
    except InterfaceDiscoveryError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return InterfaceListResponse(
        interfaces=[
            NetworkInterfaceResponse(
                name=item.name,
                ipv4_address=item.ipv4_address,
                netmask=item.netmask,
                cidr=item.cidr,
                is_up=item.is_up,
            )
            for item in interfaces
        ]
    )