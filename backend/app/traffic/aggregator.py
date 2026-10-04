from __future__ import annotations

import threading
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from scapy.layers.inet import IP


@dataclass
class TrafficCounter:
    packets: int = 0
    bytes: int = 0

    def add(self, packet_size: int) -> None:
        self.packets += 1
        self.bytes += packet_size


@dataclass
class TrafficBucket:
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


def classify_protocol(protocol_number: int) -> str:
    """
    Convert IPv4 protocol numbers into human-readable names.
    """

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

    The aggregator keeps only traffic metadata and counters.
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

        timestamp = datetime.now(timezone.utc)

        timestamp = timestamp.replace(
            microsecond=0
        )

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

    def snapshot(
        self,
        window_seconds: int = 60,
    ) -> dict[str, Any]:
        if window_seconds < 1:
            window_seconds = 1

        if window_seconds > self._max_history_seconds:
            window_seconds = self._max_history_seconds

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

            timeseries = [
                {
                    "timestamp": bucket.timestamp,
                    "packets": bucket.packets,
                    "bytes": bucket.bytes,
                }
                for bucket in buckets
            ]

            captured_seconds = max(
                1,
                len(buckets),
            )

            return {
                "interface_name": self._interface_name,
                "local_ip": self._local_ip,
                "started_at": self._started_at,
                "timestamp": now,
                "window_seconds": window_seconds,
                "captured_seconds": captured_seconds,
                "total_packets": total_packets,
                "total_bytes": total_bytes,
                "packets_per_second": (
                    total_packets / captured_seconds
                ),
                "bytes_per_second": (
                    total_bytes / captured_seconds
                ),
                "upload_bytes": directions.get(
                    "outbound",
                    TrafficCounter(),
                ).bytes,
                "download_bytes": directions.get(
                    "inbound",
                    TrafficCounter(),
                ).bytes,
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