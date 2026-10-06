from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class TelemetrySample(Base):
    """Persist one aggregate traffic and health observation."""

    __tablename__ = "telemetry_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    interface_name: Mapped[str] = mapped_column(String(64), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    bytes: Mapped[int] = mapped_column(Integer, default=0)
    packets: Mapped[int] = mapped_column(Integer, default=0)
    bytes_per_second: Mapped[float] = mapped_column(Float, default=0)
    packets_per_second: Mapped[float] = mapped_column(Float, default=0)
    upload_mbps: Mapped[float] = mapped_column(Float, default=0)
    download_mbps: Mapped[float] = mapped_column(Float, default=0)
    latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    packet_loss_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    jitter_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class DeviceTrafficSample(Base):
    """Per-peer counters associated with a persisted telemetry sample."""

    __tablename__ = "device_traffic_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    telemetry_id: Mapped[int] = mapped_column(ForeignKey("telemetry_samples.id", ondelete="CASCADE"), index=True)
    ip_address: Mapped[str] = mapped_column(String(45), index=True)
    direction: Mapped[str] = mapped_column(String(16))
    packets: Mapped[int] = mapped_column(Integer, default=0)
    bytes: Mapped[int] = mapped_column(Integer, default=0)


class Alert(Base):
    """A deduplicated network event shown in the dashboard alert feed."""

    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    type: Mapped[str] = mapped_column(String(32), index=True)
    severity: Mapped[str] = mapped_column(String(16), default="info")
    title: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(String(500))
    fingerprint: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    active: Mapped[bool] = mapped_column(default=True)
