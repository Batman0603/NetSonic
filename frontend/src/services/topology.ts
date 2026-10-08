const API_BASE_URL = "/api";

export type TopologyNodeType = "local" | "gateway" | "device";

export interface TopologyNode {
  id: string;
  type: TopologyNodeType;
  label: string;
  ip_address: string | null;
  mac_address: string | null;
  hostname: string | null;
  status: string | null;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
}

export interface TopologyResponse {
  interface_name: string;
  interface_ip: string;
  subnet: string;
  gateway_ip: string | null;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  node_count: number;
  edge_count: number;
}

async function parseErrorResponse(
  response: Response,
): Promise<string> {
  try {
    const body = await response.json();

    if (typeof body.detail === "string") {
      return body.detail;
    }

    return `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

export async function getTopology(
  interfaceName: string,
): Promise<TopologyResponse> {
  if (!interfaceName.trim()) {
    throw new Error("A network interface must be selected.");
  }

  const params = new URLSearchParams({
    interface_name: interfaceName,
  });

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/topology?${params.toString()}`,
    );
  } catch {
    throw new Error(
      "Unable to connect to the NetSonic backend.",
    );
  }

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  try {
    return (await response.json()) as TopologyResponse;
  } catch {
    throw new Error(
      "The topology API returned an invalid response.",
    );
  }
}