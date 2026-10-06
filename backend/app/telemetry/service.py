from __future__ import annotations

import statistics
import re
import os
import subprocess
import threading
from collections import deque
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.discovery.interfaces import list_ipv4_interfaces
from app.models.telemetry import Alert, DeviceTrafficSample, TelemetrySample
from app.traffic.service import traffic_monitor

WINDOWS = {"5m": timedelta(minutes=5), "1h": timedelta(hours=1), "24h": timedelta(hours=24), "7d": timedelta(days=7)}


class HealthMonitor:
    """Keep recent active-gateway probes and derive transparent health metrics."""

    def __init__(self) -> None:
        self._probes: deque[tuple[datetime, float | None]] = deque(maxlen=240)
        self._lock = threading.Lock()

    def probe(self, gateway_ip: str | None) -> None:
        if not gateway_ip:
            return
        started = datetime.now(timezone.utc)
        try:
            result = subprocess.run(
                ["ping", "-n" if os.name == "nt" else "-c", "1",
                 "-w", "1000" if os.name == "nt" else "1", gateway_ip],
                capture_output=True, text=True, timeout=2, check=False,
            )
            elapsed_ms = (datetime.now(timezone.utc) - started).total_seconds() * 1000
            success = result.returncode == 0
            measured = re.search(r"time[=<]\s*([0-9.]+)\s*ms", result.stdout, re.IGNORECASE)
            if success and measured:
                elapsed_ms = float(measured.group(1))
        except (OSError, subprocess.TimeoutExpired):
            elapsed_ms, success = 0.0, False
        with self._lock:
            self._probes.append((started, elapsed_ms if success else None))

    def metrics(self, traffic: dict | None = None) -> dict:
        with self._lock:
            values = [value for _, value in self._probes]
        successful = [value for value in values if value is not None]
        latency = statistics.mean(successful) if successful else None
        jitter = statistics.mean(abs(b - a) for a, b in zip(successful, successful[1:])) if len(successful) > 1 else None
        loss = (100 * (len(values) - len(successful)) / len(values)) if values else None
        availability = (100 - loss) if loss is not None else None
        has_traffic = traffic is not None
        traffic = traffic or {}
        rate = float(traffic.get("packets_per_second", 0))
        bandwidth = float(traffic.get("upload_mbps", 0)) + float(traffic.get("download_mbps", 0))
        traffic_health = max(0.0, min(100.0, 100 - max(0, rate - 500) / 20 - max(0, bandwidth - 50) / 2)) if has_traffic else None
        latency_score = max(0.0, 100 - latency) if latency is not None else 50.0
        loss_score = max(0.0, 100 - loss * 2) if loss is not None else 50.0
        availability_score = availability if availability is not None else 50.0
        traffic_score = traffic_health if traffic_health is not None else 50.0
        score = round(0.35 * latency_score + 0.3 * loss_score + 0.2 * availability_score + 0.15 * traffic_score)
        return {"score": score, "latency_ms": round(latency, 2) if latency is not None else None,
                "packet_loss_percent": round(loss, 2) if loss is not None else None,
                "jitter_ms": round(jitter, 2) if jitter is not None else None,
                "availability_percent": round(availability, 2) if availability is not None else None,
                "traffic_health": round(traffic_health, 1) if traffic_health is not None else None,
                "probe_count": len(values)}


health_monitor = HealthMonitor()


def record_telemetry() -> None:
    """Persist the active capture summary and per-peer totals; retain seven days."""
    status = traffic_monitor.status()
    if not status["running"] or not status["interface_name"]:
        return
    interface = next((item for item in list_ipv4_interfaces()
                      if item.name == status["interface_name"]), None)
    gateway = _gateway_for_interface(interface.name, interface.ipv4_address) if interface else None
    health_monitor.probe(gateway)
    snapshot = traffic_monitor.snapshot(status["interface_name"], 15)
    health = health_monitor.metrics(snapshot)
    now = datetime.now(timezone.utc)
    db: Session = SessionLocal()
    try:
        sample = TelemetrySample(interface_name=status["interface_name"], timestamp=now,
                                 bytes=snapshot["total_bytes"], packets=snapshot["total_packets"],
                                 bytes_per_second=snapshot["bytes_per_second"],
                                 packets_per_second=snapshot["packets_per_second"],
                                 upload_mbps=snapshot["upload_mbps"], download_mbps=snapshot["download_mbps"],
                                 latency_ms=health["latency_ms"], packet_loss_percent=health["packet_loss_percent"],
                                 jitter_ms=health["jitter_ms"], details={"health_score": health["score"], "traffic_health": health["traffic_health"]})
        db.add(sample)
        db.flush()
        for peer in snapshot.get("all_peers", snapshot.get("peers", [])):
            db.add(DeviceTrafficSample(telemetry_id=sample.id, ip_address=peer["ip_address"],
                                       direction=peer["direction"], packets=peer["packets"], bytes=peer["bytes"]))
        if snapshot["packets_per_second"] > 500:
            _upsert_alert(db, "high_packet_rate", "warning", "High packet rate",
                          f"Capture reached {snapshot['packets_per_second']:.0f} packets per second.")
        if snapshot["upload_mbps"] + snapshot["download_mbps"] > 50:
            _upsert_alert(db, "traffic_spike", "warning", "Traffic spike",
                          f"Traffic reached {snapshot['upload_mbps'] + snapshot['download_mbps']:.1f} Mbps.")
        if health["packet_loss_percent"] is not None and health["packet_loss_percent"] >= 50 and health["probe_count"] >= 4:
            _upsert_alert(db, "packet_loss", "critical", "High packet loss",
                          f"Gateway probe packet loss is {health['packet_loss_percent']:.0f}%.")
        if health["latency_ms"] is not None and health["latency_ms"] >= 200 and health["probe_count"] >= 3:
            _upsert_alert(db, "high_latency", "warning", "High network latency",
                          f"Average gateway latency is {health['latency_ms']:.0f} ms.")
        recent = list(db.scalars(select(TelemetrySample)
                                 .where(TelemetrySample.interface_name == status["interface_name"])
                                 .where(TelemetrySample.id != sample.id)
                                 .order_by(TelemetrySample.timestamp.desc()).limit(20)).all())
        baseline = _mean([item.packets_per_second for item in recent])
        if baseline is not None and len(recent) >= 5 and snapshot["packets_per_second"] > max(100, baseline * 3):
            _upsert_alert(db, "traffic_anomaly", "warning", "Unusual traffic pattern",
                          f"Packet rate {snapshot['packets_per_second']:.0f}/s is over three times its recent baseline ({baseline:.0f}/s).")
        cutoff = now - timedelta(days=7)
        old_ids = select(TelemetrySample.id).where(TelemetrySample.timestamp < cutoff)
        db.execute(delete(DeviceTrafficSample).where(DeviceTrafficSample.telemetry_id.in_(old_ids)))
        db.execute(delete(TelemetrySample).where(TelemetrySample.timestamp < cutoff))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _gateway_for_interface(interface_name: str, interface_ip: str) -> str | None:
    """Resolve the default IPv4 gateway for the selected interface."""
    try:
        if os.name == "nt":
            result = subprocess.run(["route", "print", "-4"], capture_output=True,
                                    text=True, timeout=2, check=False)
            for line in result.stdout.splitlines():
                match = re.match(r"\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\S+)\s+(\S+)", line)
                if match and match.group(2) == interface_ip:
                    return match.group(1)
            return None
        result = subprocess.run(["ip", "-4", "route", "show", "default", "dev", interface_name],
                                capture_output=True, text=True, timeout=2, check=False)
        match = re.search(r"\bvia\s+(\d{1,3}(?:\.\d{1,3}){3})", result.stdout)
        return match.group(1) if match else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def _upsert_alert(db: Session, kind: str, severity: str, title: str, message: str) -> None:
    fingerprint = f"{kind}:{datetime.now(timezone.utc).date().isoformat()}"
    alert = db.scalar(select(Alert).where(Alert.fingerprint == fingerprint))
    if alert is None:
        db.add(Alert(created_at=datetime.now(timezone.utc), type=kind, severity=severity,
                     title=title, message=message, fingerprint=fingerprint))


def get_history(db: Session, window: str, interface_name: str | None = None) -> dict:
    """Return time-bucketed historical traffic and health for a supported range."""
    duration = WINDOWS[window]
    now = datetime.now(timezone.utc)
    query = select(TelemetrySample).where(TelemetrySample.timestamp >= now - duration)
    if interface_name:
        query = query.where(TelemetrySample.interface_name == interface_name)
    rows = list(db.scalars(query.order_by(TelemetrySample.timestamp.asc())).all())
    bucket_seconds = max(15, int(duration.total_seconds() / 240))
    buckets: dict[int, list[TelemetrySample]] = {}
    for row in rows:
        stamp = row.timestamp.replace(tzinfo=timezone.utc) if row.timestamp.tzinfo is None else row.timestamp
        key = int(stamp.timestamp()) // bucket_seconds
        buckets.setdefault(key, []).append(row)
    points = []
    for key, items in buckets.items():
        points.append({"timestamp": datetime.fromtimestamp(key * bucket_seconds, timezone.utc),
                       "bytes_per_second": sum(item.bytes_per_second for item in items) / len(items),
                       "packets_per_second": sum(item.packets_per_second for item in items) / len(items),
                       "upload_mbps": sum(item.upload_mbps for item in items) / len(items),
                       "download_mbps": sum(item.download_mbps for item in items) / len(items),
                       "latency_ms": _mean([item.latency_ms for item in items]),
                       "packet_loss_percent": _mean([item.packet_loss_percent for item in items]),
                       "jitter_ms": _mean([item.jitter_ms for item in items]),
                       "health_score": _mean([item.details.get("health_score") for item in items])})
    return {"window": window, "bucket_seconds": bucket_seconds, "samples": points,
            "sample_count": len(rows), "available_since": rows[0].timestamp if rows else None}


def _mean(values: list[float | None]) -> float | None:
    present = [value for value in values if value is not None]
    return round(sum(present) / len(present), 2) if present else None


def _as_utc(value: datetime) -> datetime:
    """Attach UTC to SQLite's naive datetime values for API serialization."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def device_history(db: Session, ip_address: str, window: str = "24h") -> dict:
    """Roll up stored per-peer counters for a device over the selected range."""
    cutoff = datetime.now(timezone.utc) - WINDOWS[window]
    rows = db.execute(select(DeviceTrafficSample, TelemetrySample.timestamp)
                      .join(TelemetrySample, TelemetrySample.id == DeviceTrafficSample.telemetry_id)
                      .where(DeviceTrafficSample.ip_address == ip_address, TelemetrySample.timestamp >= cutoff)).all()
    bucket_seconds = max(15, int(WINDOWS[window].total_seconds() / 240))
    grouped: dict[int, dict[str, int]] = {}
    for item, stamp in rows:
        epoch = int(_as_utc(stamp).timestamp())
        key = epoch // bucket_seconds
        point = grouped.setdefault(key, {"bytes": 0, "packets": 0})
        point["bytes"] += item.bytes
        point["packets"] += item.packets
    return {"window": window,
            "total_bytes": sum(item.bytes for item, _ in rows),
            "total_packets": sum(item.packets for item, _ in rows),
            "samples": [{"timestamp": datetime.fromtimestamp(key * bucket_seconds, timezone.utc),
                         "bytes": values["bytes"], "packets": values["packets"]}
                        for key, values in sorted(grouped.items())]}
