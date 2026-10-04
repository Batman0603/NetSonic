import ipaddress

import pytest

from app.discovery.service import (
    DiscoveryServiceError,
    _validate_subnet,
)
from app.discovery.interfaces import InterfaceInfo


@pytest.fixture
def sample_interface() -> InterfaceInfo:
    return InterfaceInfo(
        name="test0",
        ipv4_address="192.168.29.210",
        netmask="255.255.254.0",
        cidr="192.168.28.0/23",
        is_up=True,
    )


def test_default_subnet_uses_interface_network(
    sample_interface: InterfaceInfo,
) -> None:
    result = _validate_subnet(None, sample_interface)

    assert result == ipaddress.ip_network("192.168.28.0/23")


def test_accepts_24_subnet(
    sample_interface: InterfaceInfo,
) -> None:
    result = _validate_subnet("192.168.29.0/24", sample_interface)

    assert result == ipaddress.ip_network("192.168.29.0/24")


def test_accepts_23_subnet(
    sample_interface: InterfaceInfo,
) -> None:
    result = _validate_subnet("192.168.28.0/23", sample_interface)

    assert result == ipaddress.ip_network("192.168.28.0/23")


def test_accepts_subnet_inside_interface_network(
    sample_interface: InterfaceInfo,
) -> None:
    result = _validate_subnet("192.168.29.0/25", sample_interface)

    assert result == ipaddress.ip_network("192.168.29.0/25")


def test_rejects_subnet_outside_interface_network(
    sample_interface: InterfaceInfo,
) -> None:
    with pytest.raises(DiscoveryServiceError):
        _validate_subnet("192.168.30.0/24", sample_interface)


def test_rejects_22_subnet(
    sample_interface: InterfaceInfo,
) -> None:
    with pytest.raises(DiscoveryServiceError):
        _validate_subnet("192.168.28.0/22", sample_interface)


def test_rejects_large_subnet(
    sample_interface: InterfaceInfo,
) -> None:
    with pytest.raises(DiscoveryServiceError):
        _validate_subnet("192.168.0.0/16", sample_interface)


def test_rejects_invalid_subnet(
    sample_interface: InterfaceInfo,
) -> None:
    with pytest.raises(DiscoveryServiceError):
        _validate_subnet("not-a-subnet", sample_interface)
