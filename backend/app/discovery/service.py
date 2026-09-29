import ipaddress
import logging
import socket
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.discovery.arp_scanner import (
    ArpScanError,
    DiscoveredHost,
    scan_subnet,
)
from app.discovery.interfaces import InterfaceInfo, list_ipv4_interfaces
from app.models.device import Device

logger = logging.getLogger(__name__)


class DiscoveryServiceError(Exception):
    """Raised when discovery validation or persistence fails."""


def _find_interface(interface_name: str) -> InterfaceInfo:
    interfaces = list_ipv4_interfaces()

    for interface in interfaces:
        if interface.name == interface_name:
            if not interface.is_up:
                raise DiscoveryServiceError(
                    f"Interface '{interface_name}' is currently down."
                )
            return interface

    raise DiscoveryServiceError(
        f"Interface '{interface_name}' was not found or has no IPv4 address."
    )


def _resolve_hostname(ip_address: str) -> str | None:
    """Attempt reverse DNS lookup; return None when no name is available."""
    try:
        hostname, _, _ = socket.gethostbyaddr(ip_address)
        return hostname[:255]
    except (OSError, socket.herror, socket.gaierror):
        return None


def _validate_subnet(
    requested_subnet: str | None,
    interface: InterfaceInfo,
) -> ipaddress.IPv4Network:
    try:
        interface_network = ipaddress.ip_network(interface.cidr, strict=False)

        subnet = (
            ipaddress.ip_network(requested_subnet, strict=False)
            if requested_subnet
            else interface_network
        )
    except ValueError as exc:
        raise DiscoveryServiceError(
            "Invalid IPv4 subnet. Enter a network such as 192.168.1.0/24."
        ) from exc

    if not isinstance(subnet, ipaddress.IPv4Network):
        raise DiscoveryServiceError("Only IPv4 subnets are supported.")

    if subnet.prefixlen < 24:
        raise DiscoveryServiceError(
            "For Phase 1, use a subnet of /24 or smaller address range."
        )

    if subnet.num_addresses > 256:
        raise DiscoveryServiceError(
            "Subnet is too large. The maximum supported size is 256 addresses."
        )

    if not subnet.subnet_of(interface_network):
        raise DiscoveryServiceError(
            "The requested subnet must belong to the selected interface's network."
        )

    return subnet


def _upsert_device(
    db: Session,
    host: DiscoveredHost,
    observed_at: datetime,
) -> Device:
    device = db.scalar(
        select(Device).where(Device.ip_address == host.ip_address)
    )

    if device is None:
        device = Device(
            ip_address=host.ip_address,
            mac_address=host.mac_address,
            hostname=_resolve_hostname(host.ip_address),
            status="online",
            first_seen=observed_at,
            last_seen=observed_at,
        )
        db.add(device)
    else:
        device.mac_address = host.mac_address
        device.status = "online"
        device.last_seen = observed_at

        if not device.hostname:
            device.hostname = _resolve_hostname(host.ip_address)

    return device


def discover_devices(
    db: Session,
    interface_name: str,
    requested_subnet: str | None = None,
) -> tuple[str, list[Device]]:
    """Scan a validated subnet and persist responding devices."""

    interface = _find_interface(interface_name)
    subnet = _validate_subnet(requested_subnet, interface)

    try:
        hosts = scan_subnet(subnet, interface.name)
    except ArpScanError as exc:
        raise DiscoveryServiceError(str(exc)) from exc

    observed_at = datetime.now(timezone.utc)

    try:
        devices = [
            _upsert_device(db, host, observed_at)
            for host in hosts
        ]
        db.commit()

        for device in devices:
            db.refresh(device)

        return str(subnet), devices

    except Exception as exc:
        db.rollback()
        logger.exception("Failed to persist discovered devices")
        raise DiscoveryServiceError(
            "Unable to save discovery results to the database."
        ) from exc