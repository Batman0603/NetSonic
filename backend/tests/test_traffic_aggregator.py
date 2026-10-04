from scapy.layers.inet import IP, TCP, UDP, ICMP

from app.traffic.aggregator import (
    TrafficAggregator,
    classify_direction,
    classify_protocol,
)


def test_tcp_protocol_classification() -> None:
    assert classify_protocol(6) == "TCP"


def test_udp_protocol_classification() -> None:
    assert classify_protocol(17) == "UDP"


def test_icmp_protocol_classification() -> None:
    assert classify_protocol(1) == "ICMP"


def test_unknown_protocol_classification() -> None:
    assert classify_protocol(99) == "OTHER-99"


def test_outbound_direction() -> None:
    assert (
        classify_direction(
            "192.168.1.10",
            "192.168.1.20",
            "192.168.1.10",
        )
        == "outbound"
    )


def test_inbound_direction() -> None:
    assert (
        classify_direction(
            "192.168.1.20",
            "192.168.1.10",
            "192.168.1.10",
        )
        == "inbound"
    )


def test_local_direction() -> None:
    assert (
        classify_direction(
            "192.168.1.10",
            "192.168.1.10",
            "192.168.1.10",
        )
        == "local"
    )


def test_traffic_aggregator_processes_tcp_packet() -> None:
    aggregator = TrafficAggregator()

    aggregator.start(
        interface_name="wlp62s0",
        local_ip="192.168.29.210",
    )

    packet = (
        IP(
            src="192.168.29.210",
            dst="192.168.29.1",
        )
        / TCP(
            sport=5000,
            dport=443,
        )
    )

    aggregator.process_packet(packet)

    snapshot = aggregator.snapshot()

    assert snapshot["total_packets"] == 1
    assert snapshot["total_bytes"] > 0

    assert snapshot["protocols"][0]["protocol"] == "TCP"

    assert snapshot["directions"][0]["direction"] == "outbound"


def test_traffic_aggregator_processes_udp_packet() -> None:
    aggregator = TrafficAggregator()

    aggregator.start(
        interface_name="wlp62s0",
        local_ip="192.168.29.210",
    )

    packet = (
        IP(
            src="192.168.29.1",
            dst="192.168.29.210",
        )
        / UDP(
            sport=53,
            dport=53000,
        )
    )

    aggregator.process_packet(packet)

    snapshot = aggregator.snapshot()

    assert snapshot["total_packets"] == 1
    assert snapshot["protocols"][0]["protocol"] == "UDP"
    assert snapshot["directions"][0]["direction"] == "inbound"