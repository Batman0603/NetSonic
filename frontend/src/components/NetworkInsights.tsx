import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAlerts, getNetworkHealth, getTrafficHistory, type NetworkAlert, type NetworkHealth, type TelemetryPoint, type TelemetryWindow } from "../services/insights";
import "./NetworkInsights.css";

const WINDOWS: { id: TelemetryWindow; label: string }[] = [
  { id: "5m", label: "5 min" }, { id: "1h", label: "1 hour" },
  { id: "24h", label: "24 hours" }, { id: "7d", label: "7 days" },
];

interface NetworkInsightsProps {
  interfaceName: string;
}

function metric(value: number | null, suffix: string): string {
  return value === null ? "Collecting" : `${value.toFixed(1)}${suffix}`;
}

export function NetworkInsights({ interfaceName }: NetworkInsightsProps) {
  const [selectedWindow, setSelectedWindow] = useState<TelemetryWindow>("1h");
  const [health, setHealth] = useState<NetworkHealth | null>(null);
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [alerts, setAlerts] = useState<NetworkAlert[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const [healthResult, trend, alertResult] = await Promise.all([
          getNetworkHealth(), getTrafficHistory(selectedWindow, interfaceName), getAlerts(),
        ]);
        if (cancelled) return;
        setHealth(healthResult);
        setPoints(trend.samples);
        setAlerts(alertResult.alerts);
        setError("");
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load network insights.");
      }
    }
    void refresh();
    const timer = globalThis.setInterval(() => void refresh(), 15000);
    return () => { cancelled = true; globalThis.clearInterval(timer); };
  }, [selectedWindow, interfaceName]);

  const chartPoints = points.map((point) => ({
    ...point,
    time: new Date(point.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  return (
    <section className="insights-grid" aria-label="Network health and historical telemetry">
      <article className="insight-card health-card">
        <div className="insight-heading"><div><p className="insight-kicker">NETWORK HEALTH</p><h2>Overall status</h2></div>
          <span className={`health-badge ${health?.status ?? "unknown"}`}>{health?.status ?? "Loading"}</span></div>
        <div className="health-score"><strong>{health ? health.score : "—"}</strong><span>/ 100</span></div>
        <div className="health-metrics">
          <div><span>Latency</span><strong>{metric(health?.latency_ms ?? null, " ms")}</strong></div>
          <div><span>Packet loss</span><strong>{metric(health?.packet_loss_percent ?? null, "%")}</strong></div>
          <div><span>Jitter</span><strong>{metric(health?.jitter_ms ?? null, " ms")}</strong></div>
          <div><span>Availability</span><strong>{metric(health?.availability_percent ?? null, "%")}</strong></div>
          <div><span>Traffic health</span><strong>{health?.traffic_health == null ? "Collecting" : `${health.traffic_health.toFixed(0)}%`}</strong></div>
          <div><span>Probe samples</span><strong>{health?.probe_count ?? 0}</strong></div>
        </div>
        <p className="insight-footnote">Gateway ICMP checks run while traffic capture is active. Scores are provisional until probes accumulate.</p>
      </article>

      <article className="insight-card history-card">
        <div className="insight-heading"><div><p className="insight-kicker">HISTORICAL TELEMETRY</p><h2>Traffic trends</h2></div>
          <div className="window-switch" role="group" aria-label="History range">
            {WINDOWS.map((item) => <button key={item.id} className={selectedWindow === item.id ? "selected" : ""} onClick={() => setSelectedWindow(item.id)}>{item.label}</button>)}
          </div>
        </div>
        <div className="trend-chart">
          {chartPoints.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chartPoints}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e8eb" /><XAxis dataKey="time" minTickGap={30} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} /><Tooltip /><Line type="monotone" dataKey="upload_mbps" name="Upload Mbps" stroke="#c47d0b" dot={false} />
            <Line type="monotone" dataKey="download_mbps" name="Download Mbps" stroke="#177d91" dot={false} />
          </LineChart></ResponsiveContainer> : <div className="empty-trend">{error || "Historical samples will appear after capture is running."}</div>}
        </div>
        <div className="trend-footer"><span>{points.length} trend buckets</span><span>History begins when the backend starts collecting samples.</span></div>
      </article>

      <article className="insight-card alerts-card">
        <div className="insight-heading"><div><p className="insight-kicker">ALERT ENGINE</p><h2>Recent alerts</h2></div><span className="alert-count">{alerts.length}</span></div>
        {alerts.length ? <ul className="alert-list">{alerts.slice(0, 5).map((alert) => <li key={alert.id}>
          <span className={`alert-severity ${alert.severity}`} /><div><strong>{alert.title}</strong><p>{alert.message}</p><time>{new Date(alert.created_at).toLocaleString()}</time></div>
        </li>)}</ul> : <p className="empty-inventory">No alerts yet. New devices, offline devices, packet loss, high packet rates, and traffic spikes are monitored.</p>}
      </article>
    </section>
  );
}
