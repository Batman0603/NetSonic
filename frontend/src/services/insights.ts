const API = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export type TelemetryWindow = "5m" | "1h" | "24h" | "7d";
export interface TelemetryPoint {
  timestamp: string;
  bytes_per_second: number;
  packets_per_second: number;
  upload_mbps: number;
  download_mbps: number;
  latency_ms: number | null;
  packet_loss_percent: number | null;
  jitter_ms: number | null;
  health_score: number | null;
}
export interface NetworkHealth {
  score: number;
  status: string;
  latency_ms: number | null;
  packet_loss_percent: number | null;
  jitter_ms: number | null;
  availability_percent: number | null;
  traffic_health: number | null;
  probe_count: number;
  interface_name: string | null;
  monitoring: boolean;
}
export interface NetworkAlert {
  id: number;
  created_at: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  active: boolean;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API}/api${path}`);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.detail ?? `Request failed (${response.status}).`);
  return body as T;
}

export const getNetworkHealth = () => get<NetworkHealth>("/health/network");
export const getAlerts = () => get<{ alerts: NetworkAlert[]; total: number }>("/alerts?limit=50");
export const getTrafficHistory = (window: TelemetryWindow, interfaceName = "") => {
  const params = new URLSearchParams({ window });
  if (interfaceName) params.set("interface_name", interfaceName);
  return get<{ window: TelemetryWindow; sample_count: number; samples: TelemetryPoint[] }>(`/history/traffic?${params.toString()}`);
};
