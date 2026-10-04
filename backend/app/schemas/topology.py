from typing import Literal

from pydantic import BaseModel, Field


TopologyNodeType = Literal["local", "gateway", "device"]


class TopologyNode(BaseModel):
    id: str
    type: TopologyNodeType
    label: str
    ip_address: str | None = None
    mac_address: str | None = None
    hostname: str | None = None
    status: str | None = None


class TopologyEdge(BaseModel):
    id: str
    source: str
    target: str
    relationship: str = "logical"


class TopologyResponse(BaseModel):
    interface_name: str
    interface_ip: str
    subnet: str
    gateway_ip: str | None = None

    nodes: list[TopologyNode] = Field(default_factory=list)
    edges: list[TopologyEdge] = Field(default_factory=list)

    node_count: int
    edge_count: int