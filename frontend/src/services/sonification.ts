const API_BASE_URL = "http://127.0.0.1:8000/api";

export interface SonificationParameters {
  pitch_hz: number;
  volume: number;
  pulse_rate_hz: number;
  stereo_pan: number;
  waveform: OscillatorType;
  protocol: string;
  direction: string;
  intensity: number;
}

export interface TrafficSummary {
  upload_mbps: number;
  download_mbps: number;
  packets_per_second: number;
  total_packets: number;
  total_bytes: number;
}

export interface ProtocolStat {
  protocol: string;
  packets: number;
  bytes: number;
}

export interface DirectionStat {
  direction: string;
  packets: number;
  bytes: number;
}

export interface PeerStat {
  ip_address: string;
  direction: string;
  packets: number;
  bytes: number;
}

export interface TimeSeriesPoint {
  timestamp: string;
  packets: number;
  bytes: number;
  upload_bytes: number;
  download_bytes: number;
}

export interface SonificationUpdate {
  type: "sonification_update";
  timestamp: string;
  interface_name: string;
  parameters: SonificationParameters;
  traffic: TrafficSummary;
  protocols: ProtocolStat[];
  directions: DirectionStat[];
  peers: PeerStat[];
  timeseries: TimeSeriesPoint[];
}

export interface SonificationStatus {
  enabled: boolean;
  interface_name: string | null;
  connected_clients: number;
}

async function parseResponse<T>(
  response: Response,
): Promise<T> {
  const data = await response.json();

  if (!response.ok) {
    const detail =
      typeof data?.detail === "string"
        ? data.detail
        : "Request failed.";

    throw new Error(detail);
  }

  return data as T;
}

export async function startSonification(
  interfaceName: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/sonification/start`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        interface_name: interfaceName,
      }),
    },
  );

  await parseResponse(response);
}

export async function stopSonification(): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/sonification/stop`,
    {
      method: "POST",
    },
  );

  await parseResponse(response);
}

export async function getSonificationStatus(): Promise<SonificationStatus> {
  const response = await fetch(
    `${API_BASE_URL}/sonification/status`,
  );

  return parseResponse<SonificationStatus>(
    response,
  );
}

export function createSonificationWebSocket(): WebSocket {
  const websocketUrl =
    "ws://127.0.0.1:8000/api/sonification/stream";

  return new WebSocket(websocketUrl);
}