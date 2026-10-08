import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDevice, type Device } from "../services/discovery";
import { type TelemetryWindow } from "../services/insights";
import { ThemeToggle } from "../components/ThemeToggle";
import "./DeviceDetailsPage.css";

interface DeviceTraffic {
  window: TelemetryWindow;
  total_bytes: number;
  total_packets: number;
  samples: { timestamp: string; bytes: number; packets: number }[];
}

const API = "";

export default function DeviceDetailsPage() {
  const { deviceId } = useParams();
  const [device, setDevice] = useState<Device | null>(null);
  const [traffic, setTraffic] = useState<DeviceTraffic | null>(null);
  const [window, setWindow] = useState<TelemetryWindow>("24h");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const found = await getDevice(Number(deviceId));
        if (!cancelled) setDevice(found);
        const response = await fetch(`${API}/api/devices/${found.id}/traffic?window=${window}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body?.detail ?? "Unable to load device traffic.");
        if (!cancelled) { setTraffic(body as DeviceTraffic); setError(""); }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load device details.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [deviceId, window]);

  const chart = traffic?.samples.map((sample) => ({ ...sample, time: new Date(sample.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })) ?? [];
  const name = device?.label || device?.hostname || device?.ip_address || "Device details";
  return <div className="device-details-page">
    <header className="device-details-header"><div><Link to="/">← Dashboard</Link><p>DEVICE INVENTORY</p><h1>{name}</h1><span>{device?.ip_address}</span></div><ThemeToggle /></header>
    <main className="device-details-main">
      {error && <div className="device-error" role="alert">{error}</div>}
      {device && <>
        <section className="device-facts">
          <div><span>Status</span><strong className={device.status}>{device.status}</strong></div>
          <div><span>IP address</span><strong>{device.ip_address}</strong></div>
          <div><span>MAC address</span><strong>{device.mac_address || "Unknown"}</strong></div>
          <div><span>Hostname</span><strong>{device.hostname || "Unknown"}</strong></div>
          <div><span>First seen</span><strong>{new Date(device.first_seen).toLocaleString()}</strong></div>
          <div><span>Last seen</span><strong>{new Date(device.last_seen).toLocaleString()}</strong></div>
        </section>
        <section className="device-traffic-card">
          <div className="device-traffic-heading"><div><p>HISTORICAL DEVICE STATISTICS</p><h2>Traffic activity</h2></div>
            <select aria-label="Traffic history window" value={window} onChange={(event) => setWindow(event.target.value as TelemetryWindow)}>
              <option value="5m">5 minutes</option><option value="1h">1 hour</option><option value="24h">24 hours</option><option value="7d">7 days</option>
            </select>
          </div>
          <div className="device-total-stats"><div><span>Total bytes</span><strong>{traffic?.total_bytes.toLocaleString() ?? "—"}</strong></div><div><span>Total packets</span><strong>{traffic?.total_packets.toLocaleString() ?? "—"}</strong></div></div>
          <div className="device-traffic-chart">{chart.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="time" minTickGap={30} /><YAxis /><Tooltip /><Line type="monotone" dataKey="bytes" name="Bytes" stroke="#177d91" dot={false} /><Line type="monotone" dataKey="packets" name="Packets" stroke="#c47d0b" dot={false} /></LineChart></ResponsiveContainer> : <p>Per-device history appears as telemetry samples are collected. Run discovery to refresh device status.</p>}</div>
        </section>
      </>}
    </main>
  </div>;
}
