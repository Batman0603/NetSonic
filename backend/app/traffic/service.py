from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

from app.core.exceptions import NetSonicError
from app.discovery.interfaces import (
    InterfaceDiscoveryError,
    list_ipv4_interfaces,
)
from app.traffic.aggregator import TrafficAggregator
from app.traffic.capture import (
    PacketCapture,
    PacketCaptureError,
)

logger = logging.getLogger(__name__)


class TrafficMonitor:
    """Coordinate packet capture and traffic aggregation.

    Capture callbacks run outside request handlers, so lifecycle state and
    errors are protected for concurrent API access.
    """

    def __init__(self) -> None:
        self._capture: PacketCapture | None = None
        self._aggregator = TrafficAggregator()
        self._interface_name: str | None = None
        self._local_ip: str | None = None
        self._started_at: datetime | None = None
        self._lock = threading.RLock()
        self._last_error: str | None = None

    @property
    def running(self) -> bool:
        with self._lock:
            return (
                self._capture is not None
                and self._capture.running
            )

    @property
    def interface_name(self) -> str | None:
        with self._lock:
            return self._interface_name

    @property
    def last_error(self) -> str | None:
        with self._lock:
            return self._last_error

    def start(self, interface_name: str) -> None:
        interface_name = interface_name.strip()

        if not interface_name:
            raise NetSonicError(
                "A network interface is required."
            )

        try:
            interfaces = list_ipv4_interfaces()

        except InterfaceDiscoveryError as exc:
            raise NetSonicError(
                "Unable to verify network interfaces."
            ) from exc

        interface = next(
            (
                item
                for item in interfaces
                if item.name == interface_name
            ),
            None,
        )

        if interface is None:
            raise NetSonicError(
                f"Network interface '{interface_name}' "
                "was not found or has no IPv4 address."
            )

        if not interface.is_up:
            raise NetSonicError(
                f"Network interface '{interface_name}' "
                "is currently down."
            )

        if not interface.ipv4_address:
            raise NetSonicError(
                f"Network interface '{interface_name}' "
                "does not have an IPv4 address."
            )

        with self._lock:
            if self.running:
                raise NetSonicError(
                    "Traffic monitoring is already running."
                )

            self._last_error = None
            self._interface_name = interface_name
            self._local_ip = interface.ipv4_address
            self._started_at = datetime.now(timezone.utc)

            self._aggregator.start(
                interface_name=interface_name,
                local_ip=interface.ipv4_address,
            )

            capture = PacketCapture(
                interface_name=interface_name,
                packet_callback=self._aggregator.process_packet,
            )

            self._capture = capture

            self._thread = threading.Thread(
                target=self._run_capture,
                name="netsomic-traffic-capture",
                daemon=True,
            )

            self._thread.start()

    def _run_capture(self) -> None:
        capture = self._capture

        if capture is None:
            return

        try:
            capture.start()

        except PacketCaptureError as exc:
            logger.exception(
                "Packet capture failed: %s",
                exc,
            )

            with self._lock:
                self._last_error = str(exc)

                if self._capture is capture:
                    self._capture = None

        except Exception:
            logger.exception(
                "Unexpected packet capture error."
            )

            with self._lock:
                self._last_error = (
                    "Unexpected packet capture failure."
                )

                if self._capture is capture:
                    self._capture = None

    def stop(self) -> None:
        with self._lock:
            capture = self._capture

            if capture is None:
                return

            self._capture = None
            self._interface_name = None
            self._local_ip = None
            self._started_at = None

        try:
            capture.stop()

        except PacketCaptureError as exc:
            logger.exception(
                "Unable to stop traffic capture."
            )

            raise NetSonicError(
                str(exc)
            ) from exc

        finally:
            self._aggregator.reset()

    def snapshot(
        self,
        interface_name: str,
        window_seconds: int = 60,
    ) -> dict:
        interface_name = interface_name.strip()

        with self._lock:
            if self._capture is None:
                if self._last_error:
                    raise NetSonicError(
                        self._last_error
                    )

                raise NetSonicError(
                    "Traffic monitoring has not been started."
                )

            if self._interface_name != interface_name:
                raise NetSonicError(
                    "Traffic monitoring is running on "
                    f"'{self._interface_name}', not "
                    f"'{interface_name}'."
                )

        return self._aggregator.snapshot(
            window_seconds=window_seconds,
        )

    def status(self) -> dict:
        with self._lock:
            return {
                "running": self.running,
                "interface_name": self._interface_name,
                "local_ip": self._local_ip,
                "started_at": self._started_at,
                "last_error": self._last_error,
            }


traffic_monitor = TrafficMonitor()
