from pydantic import BaseModel, Field


class SonificationStartRequest(BaseModel):
    interface_name: str = Field(
        min_length=1,
        max_length=32,
    )


class SonificationStatusResponse(BaseModel):
    enabled: bool
    interface_name: str | None
    connected_clients: int = Field(
        ge=0
    )


class SonificationConfigResponse(BaseModel):
    min_frequency: float = Field(
        ge=20,
        le=20000,
    )
    max_frequency: float = Field(
        ge=20,
        le=20000,
    )
    min_volume: float = Field(
        ge=0,
        le=1,
    )
    max_volume: float = Field(
        ge=0,
        le=1,
    )
    min_pulse_rate: float = Field(
        ge=0.1,
        le=50,
    )
    max_pulse_rate: float = Field(
        ge=0.1,
        le=50,
    )
    max_peers: int = Field(
        ge=1,
        le=16,
    )
    update_interval_ms: int = Field(
        ge=50,
        le=1000,
    )
    stereo_enabled: bool


class SonificationConfigUpdate(
    SonificationConfigResponse
):
    pass