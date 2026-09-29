import ipaddress
import logging
from dataclasses import dataclass

from scapy.all import ARP, Ether, srp
from scapy.error import Scapy_Exception

logger = logging.getLogger(__name__)


class ArpScanError(Exception):
    """Raised when an ARP scan cannot be completed."""


@dataclass(frozen=True)
class DiscoveredHost:
    ip_address: str
    mac_address: str


def scan_subnet(
    subnet: ipaddress.IPv4Network,
    interface_name: str,
    timeout_seconds: int = 2,
) -> list[DiscoveredHost]:
    """Discover responding hosts on a bounded local IPv4 subnet."""

    if subnet.num_addresses > 256:
        raise ArpScanError(
            "Subnet is too large. Use a subnet containing at most 256 addresses."
        )

    try:
        request = Ether(dst="ff:ff:ff:ff:ff:ff") / ARP(pdst=str(subnet))

        answered, _ = srp(
            request,
            iface=interface_name,
            timeout=timeout_seconds,
            retry=1,
            verbose=False,
        )

    except PermissionError as exc:
        logger.warning("Insufficient privileges for ARP scan")
        raise ArpScanError(
            "Permission denied. Run the backend with appropriate packet "
            "capture privileges."
        ) from exc
    except (OSError, Scapy_Exception) as exc:
        logger.exception("ARP scan failed on interface %s", interface_name)
        raise ArpScanError(
            "The ARP scan failed. Check the interface and network configuration."
        ) from exc

    discovered: dict[str, DiscoveredHost] = {}

    for _, response in answered:
        try:
            ip_address = str(ipaddress.IPv4Address(response.psrc))
            mac_address = str(response.hwsrc).lower()

            discovered[ip_address] = DiscoveredHost(
                ip_address=ip_address,
                mac_address=mac_address,
            )
        except (ValueError, AttributeError):
            logger.warning("Ignoring malformed ARP response")

    return sorted(
        discovered.values(),
        key=lambda host: ipaddress.IPv4Address(host.ip_address),
    )