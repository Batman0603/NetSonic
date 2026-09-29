const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export interface NetworkInterface {
  name: string;
  ipv4_address: string;
  netmask: string;
  cidr: string;
  is_up: boolean;
}

export interface Device {
  id: number;
  ip_address: string;
  mac_address: string | null;
  hostname: string | null;
  label: string | null;
  status: string;
  first_seen: string;
  last_seen: string;
}

interface InterfaceListResponse {
  interfaces: NetworkInterface[];
}

interface DeviceListResponse {
  devices: Device[];
  total: number;
}

interface DiscoveryScanResponse {
  interface_name: string;
  subnet: string;
  discovered_count: number;
  devices: Device[];
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...options?.headers,
      },
    });
  } catch {
    throw new Error(
      "Cannot connect to the backend. Check whether the API is running.",
    );
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      body?.detail ??
      body?.error?.message ??
      `Request failed with HTTP ${response.status}.`;

    throw new Error(String(detail));
  }

  return body as T;
}

export async function getInterfaces(): Promise<NetworkInterface[]> {
  const result = await request<InterfaceListResponse>("/api/interfaces");
  return result.interfaces;
}

export async function getDevices(): Promise<DeviceListResponse> {
  return request<DeviceListResponse>("/api/devices");
}

export async function scanNetwork(
  interfaceName: string,
  subnet: string,
): Promise<DiscoveryScanResponse> {
  return request<DiscoveryScanResponse>("/api/discovery/scan", {
    method: "POST",
    body: JSON.stringify({
      interface_name: interfaceName,
      subnet,
    }),
  });
}