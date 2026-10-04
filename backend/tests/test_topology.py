import ipaddress

from app.schemas.topology import TopologyEdge, TopologyNode
from app.topology.service import TopologyService


def test_topology_node_model() -> None:
    node = TopologyNode(
        id="device:192.168.1.10",
        type="device",
        label="Test Device",
        ip_address="192.168.1.10",
        mac_address="AA:BB:CC:DD:EE:FF",
        hostname="test-device",
        status="online",
    )

    assert node.type == "device"
    assert node.ip_address == "192.168.1.10"


def test_topology_edge_model() -> None:
    edge = TopologyEdge(
        id="edge:gateway:device",
        source="gateway:192.168.1.1",
        target="device:192.168.1.10",
        relationship="logical-local-network",
    )

    assert edge.source == "gateway:192.168.1.1"
    assert edge.target == "device:192.168.1.10"


def test_ipv4_membership() -> None:
    network = ipaddress.ip_network("192.168.1.0/24")

    assert ipaddress.ip_address("192.168.1.10") in network
    assert ipaddress.ip_address("10.0.0.10") not in network