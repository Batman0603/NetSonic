const API_BASE_URL = "http://127.0.0.1:8000/api";

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

export interface TrafficTimePoint {
  timestamp: string;
  packets: number;
  bytes: number;
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

  protocols: TrafficProtocolStat[];

  directions: TrafficDirectionStat[];

  peers: TrafficPeerStat[];

  timeseries: TrafficTimePoint[];
}

export interface TrafficStatus {
  running: boolean;
  interface_name: string | null;
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

export async function startTrafficMonitoring(
  interfaceName: string,
): Promise<void> {
  if (!interfaceName.trim()) {
    throw new Error(
      "A network interface must be selected.",
    );
  }

  const params = new URLSearchParams({
    interface_name: interfaceName,
  });

  const response = await request(
    `${API_BASE_URL}/traffic/start?${params.toString()}`,
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

export async function getTrafficSnapshot(
  interfaceName: string,
  windowSeconds = 60,
): Promise<TrafficSnapshot> {
  const params = new URLSearchParams({
    interface_name: interfaceName,
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
