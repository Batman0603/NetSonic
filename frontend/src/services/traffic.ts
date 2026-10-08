/** Traffic API origin. Keep in sync with the backend's local development URL. */
const API_BASE_URL = "/api";

export interface TrafficProtocolStat {
  protocol: string;
  packets: number;
  bytes: number;
}

export interface TrafficDirectionStat {
  direction: string;
  packets: number;
  bytes: number;
}

export interface TrafficPeerStat {
  ip_address: string;
  direction: string;
  packets: number;
  bytes: number;
}

export interface TrafficPeerProtocolStat extends TrafficPeerStat {
  protocol: string;
}

export interface TrafficFilters {
  /** Optional UI filters; empty strings mean the complete capture. */
  protocol: string;
  peerIp: string;
}

export interface TrafficTimePoint {
  timestamp: string;
  packets: number;
  bytes: number;
  upload_bytes?: number;
  download_bytes?: number;
  protocols?: TrafficProtocolStat[];
  peers?: TrafficPeerStat[];
  peer_protocols?: TrafficPeerProtocolStat[];
}

export interface TrafficSnapshot {
  interface_name: string;
  local_ip: string;

  started_at: string | null;
  timestamp: string;

  window_seconds: number;
  captured_seconds: number;

  total_packets: number;
  total_bytes: number;

  packets_per_second: number;
  bytes_per_second: number;

  upload_bytes: number;
  download_bytes: number;

  upload_mbps?: number;
  download_mbps?: number;

  protocols: TrafficProtocolStat[];

  directions: TrafficDirectionStat[];

  peers: TrafficPeerStat[];
  peer_protocols?: TrafficPeerProtocolStat[];

  timeseries: TrafficTimePoint[];
}

export interface TrafficStatus {
  running: boolean;
  interface_name: string | null;
  local_ip?: string | null;
  started_at?: string | null;
  last_error: string | null;
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

async function request(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(
      "Unable to connect to the NetSonic backend.",
    );
  }
}

/** Start capture on a named interface; reject blank interface names. */
export async function startTrafficMonitoring(
  interfaceName: string,
): Promise<void> {
  const cleanInterface = interfaceName.trim();

  if (!cleanInterface) {
    throw new Error(
      "A network interface must be selected.",
    );
  }

  const response = await request(
    `${API_BASE_URL}/traffic/start`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        interface_name: cleanInterface,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      await parseErrorResponse(response),
    );
  }
}

export async function stopTrafficMonitoring(): Promise<void> {
  const response = await request(
    `${API_BASE_URL}/traffic/stop`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(
      await parseErrorResponse(response),
    );
  }
}

export async function getTrafficStatus(): Promise<TrafficStatus> {
  const response = await request(
    `${API_BASE_URL}/traffic/status`,
  );

  if (!response.ok) {
    throw new Error(
      await parseErrorResponse(response),
    );
  }

  try {
    return (await response.json()) as TrafficStatus;
  } catch {
    throw new Error(
      "The traffic status API returned an invalid response.",
    );
  }
}

/** Read aggregate counters and time series for the requested rolling window. */
export async function getTrafficSnapshot(
  interfaceName: string,
  windowSeconds = 60,
): Promise<TrafficSnapshot> {
  const cleanInterface = interfaceName.trim();

  if (!cleanInterface) {
    throw new Error(
      "A network interface must be selected.",
    );
  }

  const params = new URLSearchParams({
    interface_name: cleanInterface,
    window_seconds: String(windowSeconds),
  });

  const response = await request(
    `${API_BASE_URL}/traffic/snapshot?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error(
      await parseErrorResponse(response),
    );
  }

  try {
    return (await response.json()) as TrafficSnapshot;
  } catch {
    throw new Error(
      "The traffic API returned an invalid response.",
    );
  }
}
