from datetime import datetime

from pydantic import BaseModel, ConfigDict, IPvAnyAddress


class DeviceResponse(BaseModel):
    id: int
    ip_address: IPvAnyAddress
    mac_address: str | None
    hostname: str | None
    label: str | None
    status: str
    first_seen: datetime
    last_seen: datetime

    model_config = ConfigDict(from_attributes=True)


class DeviceListResponse(BaseModel):
    devices: list[DeviceResponse]
    total: int