from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from app.sonification.normalizer import (
    AdaptiveNormalizer,
    clamp,
)


@dataclass(frozen=True)
class SonificationParameters:
    pitch_hz: float
    volume: float
    pulse_rate_hz: float
    stereo_pan: float
    waveform: str
    protocol: str
    direction: str
    intensity: float


class SonificationMapper:
    """
    Converts network metrics into audio parameters.

    The mapping is intentionally deterministic and independent
    of the audio implementation. This makes it suitable for
    testing and later research evaluation.
    """

    MIN_FREQUENCY = 220.0
    MAX_FREQUENCY = 880.0

    MIN_VOLUME = 0.04
    MAX_VOLUME = 0.80

    MIN_PULSE_RATE = 0.5
    MAX_PULSE_RATE = 8.0

    def __init__(self) -> None:
        self._traffic_normalizer = AdaptiveNormalizer()
        self._packet_normalizer = AdaptiveNormalizer()

    def map_traffic(
        self,
        upload_mbps: float,
        download_mbps: float,
        packets_per_second: float,
        protocol: str = "TCP",
        direction: str = "inbound",
    ) -> SonificationParameters:
        total_mbps = max(
            0.0,
            float(upload_mbps),
        ) + max(
            0.0,
            float(download_mbps),
        )

        traffic_intensity = self._traffic_normalizer.update(
            total_mbps
        )

        packet_intensity = self._packet_normalizer.update(
            packets_per_second
        )

        pitch_hz = self._map_pitch(
            traffic_intensity
        )

        volume = self._map_volume(
            traffic_intensity
        )

        pulse_rate_hz = self._map_pulse_rate(
            packet_intensity
        )

        stereo_pan = self._map_direction(
            direction
        )

        waveform = self._map_protocol_waveform(
            protocol
        )

        return SonificationParameters(
            pitch_hz=round(pitch_hz, 2),
            volume=round(volume, 4),
            pulse_rate_hz=round(pulse_rate_hz, 3),
            stereo_pan=round(stereo_pan, 3),
            waveform=waveform,
            protocol=protocol.upper(),
            direction=direction.lower(),
            intensity=round(
                traffic_intensity,
                4,
            ),
        )

    def _map_pitch(
        self,
        intensity: float,
    ) -> float:
        return (
            self.MIN_FREQUENCY
            + intensity
            * (
                self.MAX_FREQUENCY
                - self.MIN_FREQUENCY
            )
        )

    def _map_volume(
        self,
        intensity: float,
    ) -> float:
        return (
            self.MIN_VOLUME
            + intensity
            * (
                self.MAX_VOLUME
                - self.MIN_VOLUME
            )
        )

    def _map_pulse_rate(
        self,
        intensity: float,
    ) -> float:
        return (
            self.MIN_PULSE_RATE
            + intensity
            * (
                self.MAX_PULSE_RATE
                - self.MIN_PULSE_RATE
            )
        )

    @staticmethod
    def _map_direction(
        direction: str,
    ) -> float:
        direction = direction.lower()

        if direction == "inbound":
            return -0.80

        if direction == "outbound":
            return 0.80

        if direction == "local":
            return 0.0

        return 0.0

    @staticmethod
    def _map_protocol_waveform(
        protocol: str,
    ) -> str:
        protocol = protocol.upper()

        if protocol == "TCP":
            return "sine"

        if protocol == "UDP":
            return "triangle"

        if protocol == "ICMP":
            return "square"

        return "sine"

    def reset(self) -> None:
        self._traffic_normalizer.reset()
        self._packet_normalizer.reset()

    def map_snapshot(
        self,
        snapshot: dict[str, Any],
    ) -> dict[str, Any]:
        upload_mbps = float(
            snapshot.get(
                "upload_mbps",
                0.0,
            )
        )

        download_mbps = float(
            snapshot.get(
                "download_mbps",
                0.0,
            )
        )

        packets_per_second = float(
            snapshot.get(
                "packets_per_second",
                0.0,
            )
        )

        protocols = snapshot.get(
            "protocols",
            [],
        )

        directions = snapshot.get(
            "directions",
            [],
        )

        primary_protocol = (
            self._primary_protocol(
                protocols
            )
        )

        primary_direction = (
            self._primary_direction(
                directions
            )
        )

        parameters = self.map_traffic(
            upload_mbps=upload_mbps,
            download_mbps=download_mbps,
            packets_per_second=packets_per_second,
            protocol=primary_protocol,
            direction=primary_direction,
        )

        return {
            "parameters": asdict(parameters),
            "traffic": {
                "upload_mbps": upload_mbps,
                "download_mbps": download_mbps,
                "packets_per_second": packets_per_second,
                "total_packets": int(
                    snapshot.get(
                        "total_packets",
                        0,
                    )
                ),
                "total_bytes": int(
                    snapshot.get(
                        "total_bytes",
                        0,
                    )
                ),
            },
            "protocols": protocols,
            "directions": directions,
            "peers": snapshot.get(
                "peers",
                [],
            ),
            "timeseries": snapshot.get(
                "timeseries",
                [],
            ),
        }

    @staticmethod
    def _primary_protocol(
        protocols: list[dict[str, Any]],
    ) -> str:
        if not protocols:
            return "TCP"

        ordered = sorted(
            protocols,
            key=lambda item: int(
                item.get(
                    "bytes",
                    0,
                )
            ),
            reverse=True,
        )

        return str(
            ordered[0].get(
                "protocol",
                "TCP",
            )
        )

    @staticmethod
    def _primary_direction(
        directions: list[dict[str, Any]],
    ) -> str:
        if not directions:
            return "local"

        ordered = sorted(
            directions,
            key=lambda item: int(
                item.get(
                    "bytes",
                    0,
                )
            ),
            reverse=True,
        )

        return str(
            ordered[0].get(
                "direction",
                "local",
            )
        ).lower()