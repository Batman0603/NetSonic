from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from typing import Any

from scapy.layers.inet import IP
from scapy.sendrecv import AsyncSniffer

logger = logging.getLogger(__name__)


PacketCallback = Callable[[Any], None]


class PacketCaptureError(RuntimeError):
    """Raised when packet capture cannot be started or stopped."""


class PacketCapture:
    """
    Captures IPv4 packet metadata from a single network interface.

    Packet payloads are never stored by this class.
    """

    def __init__(
        self,
        interface_name: str,
        packet_callback: PacketCallback,
    ) -> None:
        self.interface_name = interface_name
        self._packet_callback = packet_callback

        self._sniffer: AsyncSniffer | None = None
        self._lock = threading.RLock()
        self._running = False

    @property
    def running(self) -> bool:
        with self._lock:
            return self._running

    def start(self) -> None:
        with self._lock:
            if self._running:
                raise PacketCaptureError(
                    "Packet capture is already running."
                )

            try:
                self._sniffer = AsyncSniffer(
                    iface=self.interface_name,
                    store=False,
                    prn=self._handle_packet,
                    lfilter=self._is_ipv4_packet,
                )

                self._sniffer.start()
                self._running = True

                logger.info(
                    "Packet capture started on interface '%s'.",
                    self.interface_name,
                )

            except PermissionError as exc:
                self._sniffer = None

                raise PacketCaptureError(
                    "Permission denied while starting packet capture. "
                    "Run the backend with packet-capture privileges."
                ) from exc

            except OSError as exc:
                self._sniffer = None

                raise PacketCaptureError(
                    f"Unable to access network interface "
                    f"'{self.interface_name}'."
                ) from exc

            except Exception as exc:
                self._sniffer = None

                logger.exception(
                    "Unexpected packet capture failure."
                )

                raise PacketCaptureError(
                    "Unable to start packet capture."
                ) from exc

    def stop(self) -> None:
        with self._lock:
            if not self._running:
                return

            sniffer = self._sniffer

            self._running = False
            self._sniffer = None

        if sniffer is None:
            return

        try:
            sniffer.stop()

            logger.info(
                "Packet capture stopped on interface '%s'.",
                self.interface_name,
            )

        except Exception as exc:
            logger.exception(
                "Unable to stop packet capture cleanly."
            )

            raise PacketCaptureError(
                "Unable to stop packet capture cleanly."
            ) from exc

    @staticmethod
    def _is_ipv4_packet(packet: Any) -> bool:
        return packet.haslayer(IP)

    def _handle_packet(self, packet: Any) -> None:
        if not self.running:
            return

        try:
            self._packet_callback(packet)

        except Exception:
            logger.exception(
                "Error while processing captured packet."
            )