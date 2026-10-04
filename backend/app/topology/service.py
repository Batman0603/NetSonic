import ipaddress
import logging
import re
import subprocess
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.device import Device
from app.schemas.topology import (
    TopologyEdge,
    TopologyNode,
    TopologyResponse,
)

logger = logging.getLogger(__name__)


class TopologyError(Exception):
    """Base exception for topology-related failures."""


class InterfaceNotFoundError(TopologyError):
    """Raised when the requested network interface does not exist."""


class InterfaceUnavailableError(TopologyError):
    """Raised when the requested network interface is unavailable."""


class GatewayDetectionError(TopologyError):
    """Raised when the default gateway cannot be determined."""


@dataclass(frozen=True)
class InterfaceNetwork:
    name: str
    ip_address: str
    network: ipaddress.IPv4Network


class TopologyService:
    """
    Builds a logical network topology from the local interface,
    default gateway and devices discovered during Phase 1.

    IMPORTANT:
    ARP discovery does not provide physical network topology.
    Therefore, gateway-to-device edges represent inferred logical
    relationships only.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def build_topology(self, interface_name: str) -> TopologyResponse:
        interface = self._get_interface(interface_name)

        gateway_ip = self._get_default_gateway(interface_name)

        devices = self._get_devices_for_network(interface.network)

        nodes = self._build_nodes(
            interface=interface,
            gateway_ip=gateway_ip,
            devices=devices,
        )

        edges = self._build_edges(
            gateway_ip=gateway_ip,
            interface_ip=interface.ip_address,
            devices=devices,
        )

        return TopologyResponse(
            interface_name=interface.name,
            interface_ip=interface.ip_address,
            subnet=str(interface.network),
            gateway_ip=gateway_ip,
            nodes=nodes,
            edges=edges,
            node_count=len(nodes),
            edge_count=len(edges),
        )

    def _get_interface(self, interface_name: str) -> InterfaceNetwork:
        try:
            import psutil

            addresses = psutil.net_if_addrs()
            stats = psutil.net_if_stats()
        except Exception as exc:
            logger.exception("Failed to read network interfaces.")
            raise TopologyError(
                "Unable to read network interface information."
            ) from exc

        if interface_name not in addresses:
            raise InterfaceNotFoundError(
                f"Network interface '{interface_name}' was not found."
            )

        interface_stats = stats.get(interface_name)

        if interface_stats is None or not interface_stats.isup:
            raise InterfaceUnavailableError(
                f"Network interface '{interface_name}' is currently down."
            )

        ipv4_address = None
        netmask = None

        for address in addresses[interface_name]:
            if address.family.name == "AF_INET":
                ipv4_address = address.address
                netmask = address.netmask
                break

        if not ipv4_address or not netmask:
            raise InterfaceUnavailableError(
                f"Network interface '{interface_name}' does not have an IPv4 address."
            )

        try:
            network = ipaddress.ip_network(
                f"{ipv4_address}/{netmask}",
                strict=False,
            )
        except ValueError as exc:
            raise TopologyError(
                f"Unable to calculate the IPv4 network for '{interface_name}'."
            ) from exc

        return InterfaceNetwork(
            name=interface_name,
            ip_address=ipv4_address,
            network=network,
        )

    def _get_default_gateway(self, interface_name: str) -> str | None:
        """
        Reads the Linux routing table and extracts the default gateway
        associated with the selected interface.
        """

        try:
            result = subprocess.run(
                [
                    "ip",
                    "-4",
                    "route",
                    "show",
                    "default",
                    "dev",
                    interface_name,
                ],
                capture_output=True,
                text=True,
                check=False,
                timeout=3,
            )
        except FileNotFoundError as exc:
            logger.exception("The 'ip' command is unavailable.")
            raise GatewayDetectionError(
                "The Linux 'ip' command is unavailable."
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise GatewayDetectionError(
                "Gateway detection timed out."
            ) from exc
        except OSError as exc:
            logger.exception("Failed to execute the 'ip' command.")
            raise GatewayDetectionError(
                "Unable to read the system routing table."
            ) from exc

        if result.returncode != 0:
            logger.warning(
                "Gateway command failed for interface %s: %s",
                interface_name,
                result.stderr.strip(),
            )
            return None

        gateway_match = re.search(
            r"\bdefault\s+via\s+(\d{1,3}(?:\.\d{1,3}){3})\b",
            result.stdout,
        )

        if not gateway_match:
            logger.info(
                "No default gateway found for interface %s.",
                interface_name,
            )
            return None

        gateway_ip = gateway_match.group(1)

        try:
            ipaddress.IPv4Address(gateway_ip)
        except ipaddress.AddressValueError:
            logger.warning(
                "Ignoring invalid gateway address: %s",
                gateway_ip,
            )
            return None

        return gateway_ip

    def _get_devices_for_network(
        self,
        network: ipaddress.IPv4Network,
    ) -> list[Device]:
        try:
            devices = (
                self.db.query(Device)
                .order_by(Device.ip_address.asc())
                .all()
            )
        except Exception as exc:
            logger.exception("Failed to load discovered devices.")
            raise TopologyError(
                "Unable to load discovered devices from the database."
            ) from exc

        result: list[Device] = []

        for device in devices:
            try:
                address = ipaddress.IPv4Address(device.ip_address)
            except (ValueError, TypeError):
                logger.warning(
                    "Skipping device with invalid IP address: %s",
                    device.ip_address,
                )
                continue

            if address in network:
                result.append(device)

        return result

    def _build_nodes(
        self,
        interface: InterfaceNetwork,
        gateway_ip: str | None,
        devices: list[Device],
    ) -> list[TopologyNode]:
        nodes: list[TopologyNode] = []

        nodes.append(
            TopologyNode(
                id=f"local:{interface.ip_address}",
                type="local",
                label="This device",
                ip_address=interface.ip_address,
                hostname="Local interface",
                status="online",
            )
        )

        if gateway_ip:
            gateway_device = next(
                (
                    device
                    for device in devices
                    if device.ip_address == gateway_ip
                ),
                None,
            )

            nodes.append(
                TopologyNode(
                    id=f"gateway:{gateway_ip}",
                    type="gateway",
                    label=(
                        gateway_device.hostname
                        if gateway_device
                        and gateway_device.hostname
                        else "Gateway"
                    ),
                    ip_address=gateway_ip,
                    mac_address=(
                        gateway_device.mac_address
                        if gateway_device
                        else None
                    ),
                    hostname=(
                        gateway_device.hostname
                        if gateway_device
                        else None
                    ),
                    status=(
                        gateway_device.status
                        if gateway_device
                        else "unknown"
                    ),
                )
            )

        for device in devices:
            if device.ip_address == interface.ip_address:
                continue

            if gateway_ip and device.ip_address == gateway_ip:
                continue

            hostname = getattr(device, "hostname", None)

            label = (
                hostname
                if hostname and hostname.strip()
                else device.ip_address
            )

            nodes.append(
                TopologyNode(
                    id=f"device:{device.ip_address}",
                    type="device",
                    label=label,
                    ip_address=device.ip_address,
                    mac_address=device.mac_address,
                    hostname=hostname,
                    status=device.status,
                )
            )

        return nodes

    def _build_edges(
        self,
        gateway_ip: str | None,
        interface_ip: str,
        devices: list[Device],
    ) -> list[TopologyEdge]:
        edges: list[TopologyEdge] = []

        if not gateway_ip:
            return edges

        local_node_id = f"local:{interface_ip}"
        gateway_node_id = f"gateway:{gateway_ip}"

        edges.append(
            TopologyEdge(
                id=f"edge:{local_node_id}:{gateway_node_id}",
                source=local_node_id,
                target=gateway_node_id,
                relationship="default-gateway",
            )
        )

        for device in devices:
            if device.ip_address in {
                interface_ip,
                gateway_ip,
            }:
                continue

            device_node_id = f"device:{device.ip_address}"

            edges.append(
                TopologyEdge(
                    id=f"edge:{gateway_node_id}:{device_node_id}",
                    source=gateway_node_id,
                    target=device_node_id,
                    relationship="logical-local-network",
                )
            )

        return edges