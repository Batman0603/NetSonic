from datetime import datetime

from pydantic import BaseModel, Field


class TrafficStartRequest(BaseModel):
    interface_name: str = Field(
        min_length=1,
        max_length=32,
    )


class TrafficStartResponse(BaseModel):
    message: str
    interface_name: str


class TrafficStopResponse(BaseModel):
    message: str


class TrafficStatusResponse(BaseModel):
    running: bool
    interface_name: str | None
    local_ip: str | None
    started_at: datetime | None
    last_error: str | None


class TrafficProtocolStat(BaseModel):
    protocol: str
    packets: int = Field(ge=0)
    bytes: int = Field(ge=0)


class TrafficDirectionStat(BaseModel):
    direction: str
    packets: int = Field(ge=0)
    bytes: int = Field(ge=0)


class TrafficPeerStat(BaseModel):
    ip_address: str
    direction: str
    packets: int = Field(ge=0)
    bytes: int = Field(ge=0)


class TrafficPeerProtocolStat(TrafficPeerStat):
    protocol: str


class TrafficTimePoint(BaseModel):
    timestamp: datetime
    packets: int = Field(ge=0)
    bytes: int = Field(ge=0)
    upload_bytes: int = Field(ge=0)
    download_bytes: int = Field(ge=0)
    protocols: list[TrafficProtocolStat] = Field(default_factory=list)
    peers: list[TrafficPeerStat] = Field(default_factory=list)
    peer_protocols: list[TrafficPeerProtocolStat] = Field(default_factory=list)


class TrafficSnapshotResponse(BaseModel):
    interface_name: str
    local_ip: str
    started_at: datetime | None
    timestamp: datetime

    window_seconds: int = Field(ge=1)
    captured_seconds: int = Field(ge=0)

    bytes_sent: int = Field(ge=0)
    bytes_received: int = Field(ge=0)

    packets_sent: int = Field(ge=0)
    packets_received: int = Field(ge=0)

    total_bytes: int = Field(ge=0)
    total_packets: int = Field(ge=0)

    upload_mbps: float = Field(ge=0)
    download_mbps: float = Field(ge=0)

    packets_per_second: float = Field(ge=0)
    bytes_per_second: float = Field(ge=0)

    protocols: list[TrafficProtocolStat]
    directions: list[TrafficDirectionStat]
    peers: list[TrafficPeerStat]
    peer_protocols: list[TrafficPeerProtocolStat] = Field(default_factory=list)
    timeseries: list[TrafficTimePoint]
