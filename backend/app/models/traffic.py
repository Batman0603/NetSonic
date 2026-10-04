from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class TrafficSnapshot(Base):
    __tablename__ = "traffic_snapshots"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    interface_name: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )

    timestamp: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        index=True,
    )

    bytes_sent: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    bytes_received: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    packets_sent: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    packets_received: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    upload_mbps: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.0,
    )

    download_mbps: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.0,
    )

    protocol: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
    )