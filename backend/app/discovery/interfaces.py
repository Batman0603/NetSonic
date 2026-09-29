import ipaddress
import logging
import socket
from dataclasses import dataclass

import psutil

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class InterfaceInfo:
    name: str
    ipv4_address: str
    netmask: str
    cidr: str
    is_up: bool


class InterfaceDiscoveryError(Exception):
    """Raised when network interface discovery fails."""


def list_ipv4_interfaces() -> list[InterfaceInfo]:
    """Return active or inactive non-loopback interfaces with IPv4 addresses."""
    try:
        addresses_by_interface = psutil.net_if_addrs()
        stats_by_interface = psutil.net_if_stats()
    except (OSError, RuntimeError) as exc:
        logger.exception("Unable to retrieve network interface information")
        raise InterfaceDiscoveryError(
            "Unable to retrieve network interfaces."
        ) from exc

    interfaces: list[InterfaceInfo] = []

    for interface_name, addresses in addresses_by_interface.items():
        if interface_name == "lo":
            continue

        stats = stats_by_interface.get(interface_name)
        is_up = bool(stats and stats.isup)

        for address in addresses:
            # psutil exposes platform socket families in ``family``; use the
            # stdlib constant rather than relying on psutil re-exporting it.
            if address.family != socket.AF_INET:
                continue

            if not address.address or not address.netmask:
                continue

            try:
                interface_network = ipaddress.ip_interface(
                    f"{address.address}/{address.netmask}"
                )
            except ValueError:
                logger.warning(
                    "Skipping interface with invalid IPv4 configuration: %s",
                    interface_name,
                )
                continue

            if interface_network.ip.is_loopback:
                continue

            interfaces.append(
                InterfaceInfo(
                    name=interface_name,
                    ipv4_address=str(interface_network.ip),
                    netmask=address.netmask,
                    cidr=str(interface_network.network),
                    is_up=is_up,
                )
            )

    return interfaces
