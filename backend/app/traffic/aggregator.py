from __future__ import annotations

import threading
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from scapy.layers.inet import IP


@dataclass
class TrafficCounter:
    """Packet and byte totals for one aggregation key."""
    packets: int = 0
    bytes: int = 0

    def add(self, packet_size: int) -> None:
        self.packets += 1
        self.bytes += packet_size


@dataclass
class TrafficBucket:
    """Per-second packet totals split by protocol, direction, and peer."""
    timestamp: datetime

    packets: int = 0
    bytes: int = 0

    protocols: dict[str, TrafficCounter] = field(
        default_factory=dict
    )

    directions: dict[str, TrafficCounter] = field(
        default_factory=dict
    )

    peers: dict[tuple[str, str], TrafficCounter] = field(
        default_factory=dict
    )
    peer_protocols: dict[tuple[str, str, str], TrafficCounter] = field(
        default_factory=dict
    )


def classify_protocol(protocol_number: int) -> str:
    """Convert an IPv4 protocol number to a familiar name or OTHER label."""
    protocol_map = {
        1: "ICMP",
        6: "TCP",
        17: "UDP",
    }

    return protocol_map.get(
        protocol_number,
        f"OTHER-{protocol_number}",
    )


def classify_direction(
    source_ip: str,
    destination_ip: str,
    local_ip: str,
) -> str:
    """Classify a packet relative to the monitored interface's IPv4 address."""
    if source_ip == local_ip and destination_ip == local_ip:
        return "local"

    if source_ip == local_ip:
        return "outbound"

    if destination_ip == local_ip:
        return "inbound"

    return "other"


class TrafficAggregator:
    """
    Thread-safe rolling traffic aggregator.

    Only packet metadata and counters are retained.
    Packet payloads are never stored.
    """

    def __init__(
        self,
        max_history_seconds: int = 300,
    ) -> None:
        self._max_history_seconds = max_history_seconds

        self._buckets: deque[TrafficBucket] = deque(
            maxlen=max_history_seconds
        )

        self._lock = threading.RLock()

        self._interface_name = ""
        self._local_ip = ""
        self._started_at: datetime | None = None

    def start(
        self,
        interface_name: str,
        local_ip: str,
    ) -> None:
        with self._lock:
            self._interface_name = interface_name
            self._local_ip = local_ip
            self._buckets.clear()

            self._started_at = datetime.now(
                timezone.utc
            )

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()
            self._started_at = None
            self._interface_name = ""
            self._local_ip = ""

    def process_packet(self, packet: Any) -> None:
        """Aggregate IPv4 metadata into its UTC-second bucket; retain no payload."""
        if not packet.haslayer(IP):
            return

        ip_packet = packet[IP]

        source_ip = str(ip_packet.src)
        destination_ip = str(ip_packet.dst)

        packet_size = len(packet)

        protocol = classify_protocol(
            int(ip_packet.proto)
        )

        direction = classify_direction(
            source_ip,
            destination_ip,
            self._local_ip,
        )

        timestamp = datetime.now(
            timezone.utc
        ).replace(microsecond=0)

        with self._lock:
            bucket = self._get_or_create_bucket(
                timestamp
            )

            bucket.packets += 1
            bucket.bytes += packet_size

            protocol_counter = bucket.protocols.setdefault(
                protocol,
                TrafficCounter(),
            )

            protocol_counter.add(packet_size)

            direction_counter = bucket.directions.setdefault(
                direction,
                TrafficCounter(),
            )

            direction_counter.add(packet_size)

            if direction == "outbound":
                peer_ip = destination_ip

            elif direction == "inbound":
                peer_ip = source_ip

            else:
                peer_ip = None

            if peer_ip:
                peer_counter = bucket.peers.setdefault(
                    (peer_ip, direction),
                    TrafficCounter(),
                )

                peer_counter.add(packet_size)

                bucket.peer_protocols.setdefault(
                    (peer_ip, direction, protocol),
                    TrafficCounter(),
                ).add(packet_size)

    def snapshot(
        self,
        window_seconds: int = 60,
    ) -> dict[str, Any]:
        """Summarize recent buckets into rates, breakdowns, and time-series data.

        The requested window is clamped to the retained history. Rates use the
        observed bucket span when available, avoiding division by an idle full
        window immediately after capture starts.
        """
        window_seconds = max(
            1,
            min(
                window_seconds,
                self._max_history_seconds,
            ),
        )

        now = datetime.now(timezone.utc)

        cutoff = now - timedelta(
            seconds=window_seconds
        )

        with self._lock:
            buckets = [
                bucket
                for bucket in self._buckets
                if bucket.timestamp >= cutoff
            ]

            total_packets = sum(
                bucket.packets
                for bucket in buckets
            )

            total_bytes = sum(
                bucket.bytes
                for bucket in buckets
            )

            protocols = self._aggregate_protocols(
                buckets
            )

            directions = self._aggregate_directions(
                buckets
            )

            peers = self._aggregate_peers(
                buckets
            )
            peer_protocols = self._aggregate_peer_protocols(buckets)

            upload_counter = directions.get(
                "outbound",
                TrafficCounter(),
            )

            download_counter = directions.get(
                "inbound",
                TrafficCounter(),
            )

            # Use the actual elapsed observation time where possible.
            if buckets:
                first_timestamp = buckets[0].timestamp
                last_timestamp = buckets[-1].timestamp

                elapsed_seconds = (
                    last_timestamp - first_timestamp
                ).total_seconds() + 1.0

                captured_seconds = max(
                    1.0,
                    min(
                        float(window_seconds),
                        elapsed_seconds,
                    ),
                )
            else:
                captured_seconds = 1.0

            upload_mbps = (
                upload_counter.bytes
                * 8
                / captured_seconds
                / 1_000_000
            )

            download_mbps = (
                download_counter.bytes
                * 8
                / captured_seconds
                / 1_000_000
            )

            packets_per_second = (
                total_packets
                / captured_seconds
            )

            bytes_per_second = (
                total_bytes
                / captured_seconds
            )

            timeseries = []

            for bucket in buckets:
                upload_bytes = bucket.directions.get(
                    "outbound",
                    TrafficCounter(),
                ).bytes

                download_bytes = bucket.directions.get(
                    "inbound",
                    TrafficCounter(),
                ).bytes

                timeseries.append(
                    {
                        "timestamp": bucket.timestamp,
                        "packets": bucket.packets,
                        "bytes": bucket.bytes,
                        "upload_bytes": upload_bytes,
                        "download_bytes": download_bytes,
                        "protocols": [
                            {
                                "protocol": protocol,
                                "packets": counter.packets,
                                "bytes": counter.bytes,
                            }
                            for protocol, counter in bucket.protocols.items()
                        ],
                        "peers": [
                            {
                                "ip_address": peer_ip,
                                "direction": direction,
                                "packets": counter.packets,
                                "bytes": counter.bytes,
                            }
                            for (peer_ip, direction), counter in sorted(
                                bucket.peers.items(),
                                key=lambda item: item[1].bytes,
                                reverse=True,
                            )[:20]
                        ],
                        "peer_protocols": [
                            {
                                "ip_address": peer_ip,
                                "direction": direction,
                                "protocol": protocol,
                                "packets": counter.packets,
                                "bytes": counter.bytes,
                            }
                            for (peer_ip, direction, protocol), counter in sorted(
                                bucket.peer_protocols.items(),
                                key=lambda item: item[1].bytes,
                                reverse=True,
                            )[:20]
                        ],
                    }
                )

            return {
                "interface_name": self._interface_name,
                "local_ip": self._local_ip,
                "started_at": self._started_at,
                "timestamp": now,

                "window_seconds": window_seconds,
                "captured_seconds": int(
                    captured_seconds
                ),

                "bytes_sent": upload_counter.bytes,
                "bytes_received": download_counter.bytes,

                "packets_sent": upload_counter.packets,
                "packets_received": download_counter.packets,

                "total_bytes": total_bytes,
                "total_packets": total_packets,

                "upload_mbps": upload_mbps,
                "download_mbps": download_mbps,

                "packets_per_second": packets_per_second,
                "bytes_per_second": bytes_per_second,

                "protocols": [
                    {
                        "protocol": protocol,
                        "packets": counter.packets,
                        "bytes": counter.bytes,
                    }
                    for protocol, counter
                    in sorted(
                        protocols.items(),
                        key=lambda item: item[1].bytes,
                        reverse=True,
                    )
                ],

                "directions": [
                    {
                        "direction": direction,
                        "packets": counter.packets,
                        "bytes": counter.bytes,
                    }
                    for direction, counter
                    in sorted(
                        directions.items(),
                        key=lambda item: item[1].bytes,
                        reverse=True,
                    )
                ],

                "peers": [
                    {
                        "ip_address": peer_ip,
                        "direction": direction,
                        "packets": counter.packets,
                        "bytes": counter.bytes,
                    }
                    for (peer_ip, direction), counter
                    in sorted(
                        peers.items(),
                        key=lambda item: item[1].bytes,
                        reverse=True,
                    )[:10]
                ],

                "peer_protocols": [
                    {
                        "ip_address": peer_ip,
                        "direction": direction,
                        "protocol": protocol,
                        "packets": counter.packets,
                        "bytes": counter.bytes,
                    }
                    for (peer_ip, direction, protocol), counter in sorted(
                        peer_protocols.items(),
                        key=lambda item: item[1].bytes,
                        reverse=True,
                    )[:100]
                ],

                "timeseries": timeseries,
            }

    def _get_or_create_bucket(
        self,
        timestamp: datetime,
    ) -> TrafficBucket:
        if (
            self._buckets
            and self._buckets[-1].timestamp == timestamp
        ):
            return self._buckets[-1]

        bucket = TrafficBucket(
            timestamp=timestamp
        )

        self._buckets.append(bucket)

        return bucket

    @staticmethod
    def _aggregate_protocols(
        buckets: list[TrafficBucket],
    ) -> dict[str, TrafficCounter]:
        result: dict[str, TrafficCounter] = defaultdict(
            TrafficCounter
        )

        for bucket in buckets:
            for protocol, counter in bucket.protocols.items():
                result[protocol].packets += counter.packets
                result[protocol].bytes += counter.bytes

        return result

    @staticmethod
    def _aggregate_directions(
        buckets: list[TrafficBucket],
    ) -> dict[str, TrafficCounter]:
        result: dict[str, TrafficCounter] = defaultdict(
            TrafficCounter
        )

        for bucket in buckets:
            for direction, counter in bucket.directions.items():
                result[direction].packets += counter.packets
                result[direction].bytes += counter.bytes

        return result

    @staticmethod
    def _aggregate_peers(
        buckets: list[TrafficBucket],
    ) -> dict[tuple[str, str], TrafficCounter]:
        result: dict[
            tuple[str, str],
            TrafficCounter,
        ] = defaultdict(TrafficCounter)

        for bucket in buckets:
            for peer, counter in bucket.peers.items():
                result[peer].packets += counter.packets
                result[peer].bytes += counter.bytes

        return result

    @staticmethod
    def _aggregate_peer_protocols(
        buckets: list[TrafficBucket],
    ) -> dict[tuple[str, str, str], TrafficCounter]:
        result: dict[
            tuple[str, str, str],
            TrafficCounter,
        ] = defaultdict(TrafficCounter)

        for bucket in buckets:
            for peer_protocol, counter in bucket.peer_protocols.items():
                result[peer_protocol].packets += counter.packets
                result[peer_protocol].bytes += counter.bytes

        return result
