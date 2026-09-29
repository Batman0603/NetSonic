from pydantic import BaseModel, Field

from app.schemas.device import DeviceResponse


class NetworkInterfaceResponse(BaseModel):
    name: str
    ipv4_address: str
    netmask: str
    cidr: str
    is_up: bool


class InterfaceListResponse(BaseModel):
    interfaces: list[NetworkInterfaceResponse]


class DiscoveryScanRequest(BaseModel):
    interface_name: str = Field(min_length=1, max_length=64)
    subnet: str | None = Field(default=None, max_length=18)


class DiscoveryScanResponse(BaseModel):
    interface_name: str
    subnet: str
    discovered_count: int
    devices: list[DeviceResponse]