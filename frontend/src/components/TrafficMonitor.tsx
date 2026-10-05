import { useEffect, useMemo, useRef, useState } from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  getTrafficSnapshot,
  getTrafficStatus,
  startTrafficMonitoring,
  stopTrafficMonitoring,
  type TrafficFilters,
  type TrafficSnapshot,
  type TrafficStatus,
} from "../services/traffic";

import "./TrafficMonitor.css";
import { useTheme } from "../contexts/ThemeContext";
import {
  createHistorySample,
  loadTrafficSessions,
  MAX_SAMPLES_PER_SESSION,
  saveTrafficSession,
  type TrafficHistorySession,
} from "../services/sessionHistory";

interface TrafficMonitorProps {
  interfaceName: string;
  filters: TrafficFilters;
  onFiltersChange: (filters: TrafficFilters) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes.toFixed(0)} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${(
    bytes /
    (1024 * 1024 * 1024)
  ).toFixed(2)} GB`;
}

function formatRate(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function explainCaptureError(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("permission denied") ||
    normalized.includes("operation not permitted") ||
    normalized.includes("permissionerror") ||
    normalized.includes("raw socket")
  ) {
    return `${message} Packet capture was blocked by operating-system permissions. Grant the backend process raw-packet capture access, then restart monitoring.`;
  }
  if (
    normalized.includes("interface") &&
    (normalized.includes("not found") || normalized.includes("down"))
  ) {
    return `${message} Refresh the interface list and select an active interface with an IPv4 address.`;
  }
  return message;
}

function downloadBlob(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function readThreshold(key: string, fallback: number): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function TrafficMonitor({
  interfaceName,
  filters,
  onFiltersChange,
}: TrafficMonitorProps) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const [traffic, setTraffic] =
    useState<TrafficSnapshot | null>(null);

  const [status, setStatus] =
    useState<TrafficStatus | null>(null);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [isLoading, setIsLoading] =
    useState(false);

  const [historySessions, setHistorySessions] = useState(loadTrafficSessions);
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSampleCount, setRecordedSampleCount] = useState(0);
  const recordingRef = useRef<TrafficHistorySession | null>(null);
  const lastRecordedTimestampRef = useRef("");
  const [packetAlertThreshold, setPacketAlertThreshold] = useState(() => readThreshold("netsonic.alert.packets", 100));
  const [bandwidthAlertThreshold, setBandwidthAlertThreshold] = useState(() => readThreshold("netsonic.alert.mbps", 5));
  const [historyError, setHistoryError] = useState<string | null>(null);

  const isMonitoring =
    status?.running === true;

  useEffect(() => {
    if (!interfaceName) {
      return;
    }

    async function loadStatus(): Promise<void> {
      try {
        const result =
          await getTrafficStatus();

        setStatus(result);

        if (
          result.last_error
          && !result.running
        ) {
          setErrorMessage(
            explainCaptureError(result.last_error),
          );
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to read traffic status.",
        );
      }
    }

    void loadStatus();
  }, [interfaceName]);

  useEffect(() => {
    if (!isMonitoring) {
      return;
    }

    let cancelled = false;

    async function updateTraffic(): Promise<void> {
      try {
        const snapshot =
          await getTrafficSnapshot(interfaceName, 60);

        if (!cancelled) {
          setTraffic(snapshot);
          setErrorMessage(null);
          if (isRecording && recordingRef.current) {
            const sample = createHistorySample(snapshot);
            const draft = recordingRef.current;
            if (
              sample &&
              sample.timestamp !== lastRecordedTimestampRef.current &&
              draft.samples.length < MAX_SAMPLES_PER_SESSION
            ) {
              draft.samples.push(sample);
              lastRecordedTimestampRef.current = sample.timestamp;
              setRecordedSampleCount(draft.samples.length);
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          let captureError: string | null = null;
          try {
            const latestStatus = await getTrafficStatus();
            setStatus(latestStatus);
            if (latestStatus.last_error) {
              captureError = explainCaptureError(latestStatus.last_error);
            }
          } catch {
            // Keep the original snapshot error visible.
          }
          setErrorMessage(
            captureError ?? (error instanceof Error
              ? explainCaptureError(error.message)
              : "Unable to read traffic metrics."),
          );
        }
      }
    }

    void updateTraffic();

    const interval =
      window.setInterval(
        () => {
          void updateTraffic();
        },
        1000,
      );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [interfaceName, isMonitoring, isRecording]);

  async function handleStart(): Promise<void> {
    if (!interfaceName) {
      setErrorMessage(
        "Select a network interface first.",
      );

      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await startTrafficMonitoring(
        interfaceName,
      );

      const newStatus =
        await getTrafficStatus();

      setStatus(newStatus);

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start traffic monitoring.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStop(): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await stopTrafficMonitoring();

      const newStatus =
        await getTrafficStatus();

      setStatus(newStatus);

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to stop traffic monitoring.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleStartRecording(): void {
    const session: TrafficHistorySession = {
      id: crypto.randomUUID(),
      name: `Capture ${new Date().toLocaleString()}`,
      interfaceName,
      startedAt: new Date().toISOString(),
      endedAt: "",
      samples: [],
    };
    recordingRef.current = session;
    lastRecordedTimestampRef.current = "";
    setRecordedSampleCount(0);
    setSelectedHistoryId("");
    setHistoryError(null);
    setIsRecording(true);
  }

  function handleStopRecording(): void {
    const session = recordingRef.current;
    if (!session) return;
    session.endedAt = new Date().toISOString();
    recordingRef.current = null;
    setIsRecording(false);
    try {
      saveTrafficSession(session);
      setHistorySessions(loadTrafficSessions());
      setSelectedHistoryId(session.id);
      setHistoryError(null);
    } catch {
      setHistoryError("Browser storage is full. Export this capture before closing the page.");
    }
  }

  const selectedHistory = historySessions.find((session) => session.id === selectedHistoryId);
  const sourcePoints = useMemo(
    () => selectedHistory?.samples ?? traffic?.timeseries ?? [],
    [selectedHistory, traffic],
  );
  const peerOptions = traffic?.peers ?? [];
  const visiblePoints = useMemo(() => sourcePoints.map((point) => {
    const protocol = filters.protocol.toUpperCase();
    const peerIp = filters.peerIp;
    if (!protocol && !peerIp) return point;
    if (protocol && !peerIp) {
      const row = (point.protocols ?? []).find((item) => item.protocol.toUpperCase() === protocol);
      const matching = (point.peer_protocols ?? []).filter((item) => item.protocol.toUpperCase() === protocol);
      return {
        ...point,
        packets: row?.packets ?? 0,
        bytes: row?.bytes ?? 0,
        upload_bytes: matching.filter((item) => item.direction === "outbound").reduce((sum, item) => sum + item.bytes, 0),
        download_bytes: matching.filter((item) => item.direction === "inbound").reduce((sum, item) => sum + item.bytes, 0),
      };
    }
    const peerProtocols = point.peer_protocols ?? [];
    const matching = peerProtocols.filter((row) =>
      (!protocol || row.protocol.toUpperCase() === protocol) &&
      (!peerIp || row.ip_address === peerIp),
    );
    const packets = matching.reduce((sum, row) => sum + row.packets, 0);
    const bytes = matching.reduce((sum, row) => sum + row.bytes, 0);
    const inbound = matching.filter((row) => row.direction === "inbound").reduce((sum, row) => sum + row.bytes, 0);
    const outbound = matching.filter((row) => row.direction === "outbound").reduce((sum, row) => sum + row.bytes, 0);
    return { ...point, packets, bytes, upload_bytes: outbound, download_bytes: inbound };
  }), [sourcePoints, filters]);

  const protocolData = useMemo(() => {
    if (!filters.protocol && !filters.peerIp) return traffic?.protocols ?? [];
    const totals = new Map<string, { protocol: string; packets: number; bytes: number }>();
    for (const point of sourcePoints) {
      if (filters.protocol && !filters.peerIp) {
        const row = (point.protocols ?? []).find((item) => item.protocol.toUpperCase() === filters.protocol.toUpperCase());
        if (row) {
          const current = totals.get(row.protocol) ?? { protocol: row.protocol, packets: 0, bytes: 0 };
          current.packets += row.packets;
          current.bytes += row.bytes;
          totals.set(row.protocol, current);
        }
        continue;
      }
      for (const row of point.peer_protocols ?? []) {
        if (filters.protocol && row.protocol.toUpperCase() !== filters.protocol.toUpperCase()) continue;
        if (filters.peerIp && row.ip_address !== filters.peerIp) continue;
        const current = totals.get(row.protocol) ?? { protocol: row.protocol, packets: 0, bytes: 0 };
        current.packets += row.packets;
        current.bytes += row.bytes;
        totals.set(row.protocol, current);
      }
    }
    return [...totals.values()];
  }, [filters, sourcePoints, traffic]);

  const directionData = useMemo(() => {
    if (!filters.protocol && !filters.peerIp) return traffic?.directions ?? [];
    const totals = new Map<string, { direction: string; packets: number; bytes: number }>();
    for (const point of sourcePoints) {
      for (const row of point.peer_protocols ?? []) {
        if (filters.protocol && row.protocol.toUpperCase() !== filters.protocol.toUpperCase()) continue;
        if (filters.peerIp && row.ip_address !== filters.peerIp) continue;
        const current = totals.get(row.direction) ?? { direction: row.direction, packets: 0, bytes: 0 };
        current.packets += row.packets;
        current.bytes += row.bytes;
        totals.set(row.direction, current);
      }
    }
    return [...totals.values()];
  }, [filters, sourcePoints, traffic]);

  const visiblePeers = useMemo(() => {
    const totals = new Map<string, { ip_address: string; direction: string; packets: number; bytes: number }>();
    const rows = selectedHistory || filters.protocol || filters.peerIp
      ? visiblePoints.flatMap((point) => filters.peerIp || filters.protocol
        ? (point.peer_protocols ?? [])
          .filter((row) => (!filters.peerIp || row.ip_address === filters.peerIp) && (!filters.protocol || row.protocol.toUpperCase() === filters.protocol.toUpperCase()))
          .map((row) => ({ ip_address: row.ip_address, direction: row.direction, packets: row.packets, bytes: row.bytes }))
        : point.peers ?? [])
      : traffic?.peers ?? [];
    for (const row of rows) {
      const key = `${row.ip_address}-${row.direction}`;
      const total = totals.get(key) ?? { ...row, packets: 0, bytes: 0 };
      total.packets += row.packets;
      total.bytes += row.bytes;
      totals.set(key, total);
    }
    return [...totals.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 10);
  }, [filters, selectedHistory, traffic, visiblePoints]);

  const chartData = useMemo(() => {
    return visiblePoints.map(
      (point) => ({
        time: new Date(
          point.timestamp,
        ).toLocaleTimeString(
          [],
          {
            minute: "2-digit",
            second: "2-digit",
          },
        ),

        packets: point.packets,

        bytes: point.bytes,
      }),
    );
  }, [visiblePoints]);

  const currentPacketsPerSecond = chartData.at(-1)?.packets ?? 0;
  const currentMbps = ((chartData.at(-1)?.bytes ?? 0) * 8) / 1_000_000;
  const packetAlert = !selectedHistory && currentPacketsPerSecond >= packetAlertThreshold;
  const bandwidthAlert = !selectedHistory && currentMbps >= bandwidthAlertThreshold;

  function exportSession(format: "csv" | "json"): void {
    const session = selectedHistory ?? (traffic ? {
      id: crypto.randomUUID(), name: `Live snapshot ${new Date().toLocaleString()}`,
      interfaceName, startedAt: traffic.started_at ?? traffic.timestamp,
      endedAt: traffic.timestamp, samples: traffic.timeseries,
    } : null);
    if (!session) return;
    const safeName = session.name.replace(/[^a-z0-9-_]+/gi, "-").slice(0, 48);
    if (format === "json") {
      downloadBlob(`${safeName}.json`, JSON.stringify(session, null, 2), "application/json");
      return;
    }
    const rows = ["timestamp,packets,bytes,upload_bytes,download_bytes,protocols,peers,peer_protocols"];
    for (const point of session.samples) {
      const protocols = (point.protocols ?? []).map((item) => `${item.protocol}:${item.packets}`).join("|");
      const peers = (point.peers ?? []).map((item) => `${item.ip_address}:${item.packets}`).join("|");
      const peerProtocols = (point.peer_protocols ?? []).map((item) => `${item.ip_address}:${item.protocol}:${item.packets}`).join("|");
      rows.push([point.timestamp, point.packets, point.bytes, point.upload_bytes ?? 0, point.download_bytes ?? 0, protocols, peers, peerProtocols].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
    }
    downloadBlob(`${safeName}.csv`, rows.join("\n"), "text/csv;charset=utf-8");
  }

  return (
    <section className="traffic-section">
      <div className="traffic-header">
        <div>
          <p className="eyebrow">
            PHASE 3
          </p>

          <h2>
            Network traffic monitoring
          </h2>

          <p className="traffic-description">
            Capture and aggregate authorized IPv4
            network traffic from the selected interface.
            Packet payloads are not stored.
          </p>
        </div>

        <div className="traffic-controls">
          <div
            className={
              isMonitoring
                ? "traffic-live-badge traffic-live"
                : "traffic-live-badge"
            }
          >
            <span className="traffic-live-dot" />

            {isMonitoring
              ? "LIVE"
              : "STOPPED"}
          </div>

          {!isMonitoring ? (
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                void handleStart()
              }
              disabled={
                isLoading ||
                !interfaceName
              }
            >
              {isLoading
                ? "Starting..."
                : "Start monitoring"}
            </button>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                void handleStop()
              }
              disabled={isLoading}
            >
              {isLoading
                ? "Stopping..."
                : "Stop monitoring"}
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div
          className="notice notice-error"
          role="alert"
        >
          <strong>Traffic error:</strong>
          <span>{errorMessage}</span>
        </div>
      )}

      {!interfaceName && (
        <div className="traffic-empty">
          Select an active network interface
          to begin traffic monitoring.
        </div>
      )}

      {interfaceName && (
        <>
          <div className="traffic-status-bar">
            <div>
              <span
                className={
                  isMonitoring
                    ? "traffic-status-dot active"
                    : "traffic-status-dot"
                }
              />

              <span>
                {isMonitoring
                  ? `Monitoring ${interfaceName}`
                  : "Monitoring stopped"}
              </span>
            </div>

            {status?.interface_name && (
              <span>
                Local interface:{" "}
                <strong>
                  {status.interface_name}
                </strong>
              </span>
            )}
          </div>

          <div className="traffic-tools">
            <label>
              Protocol
              <select value={filters.protocol} onChange={(event) => onFiltersChange({ ...filters, protocol: event.target.value })}>
                <option value="">All protocols</option>
                {[...new Set([...(traffic?.protocols ?? []).map((item) => item.protocol)])].sort().map((protocol) => <option key={protocol} value={protocol}>{protocol}</option>)}
              </select>
            </label>
            <label>
              Peer
              <select value={filters.peerIp} onChange={(event) => onFiltersChange({ ...filters, peerIp: event.target.value })}>
                <option value="">All peers</option>
                {peerOptions.map((peer) => <option key={peer.ip_address} value={peer.ip_address}>{peer.ip_address}</option>)}
              </select>
            </label>
            <div className="traffic-history-actions">
              {isRecording ? (
                <button type="button" className="secondary-button" onClick={handleStopRecording}>Stop recording ({recordedSampleCount})</button>
              ) : (
                <button type="button" className="secondary-button" onClick={handleStartRecording} disabled={!isMonitoring}>Record session</button>
              )}
              <select aria-label="Replay saved session" value={selectedHistoryId} onChange={(event) => setSelectedHistoryId(event.target.value)}>
                <option value="">Live traffic</option>
                {historySessions.map((session) => <option key={session.id} value={session.id}>{session.name} · {session.samples.length} samples</option>)}
              </select>
              <button type="button" className="secondary-button" onClick={() => exportSession("csv")} disabled={!traffic && !selectedHistory}>Export CSV</button>
              <button type="button" className="secondary-button" onClick={() => exportSession("json")} disabled={!traffic && !selectedHistory}>Export JSON</button>
            </div>
          </div>

          <div className="traffic-alert-settings">
            <strong>Traffic alerts</strong>
            <label>Packets/s <input type="number" min="1" value={packetAlertThreshold} onChange={(event) => {
              const value = Math.max(1, Number(event.target.value) || 1);
              setPacketAlertThreshold(value);
              try { localStorage.setItem("netsonic.alert.packets", String(value)); } catch { /* Browser storage can be disabled. */ }
            }} /></label>
            <label>Mbps <input type="number" min="0.1" step="0.1" value={bandwidthAlertThreshold} onChange={(event) => {
              const value = Math.max(0.1, Number(event.target.value) || 0.1);
              setBandwidthAlertThreshold(value);
              try { localStorage.setItem("netsonic.alert.mbps", String(value)); } catch { /* Browser storage can be disabled. */ }
            }} /></label>
          </div>
          {(packetAlert || bandwidthAlert) && (
            <div className="traffic-threshold-alert" role="status">
              <strong>Traffic threshold crossed</strong>
              <span>{packetAlert ? `${currentPacketsPerSecond.toFixed(1)} packets/s` : ""}{packetAlert && bandwidthAlert ? " · " : ""}{bandwidthAlert ? `${currentMbps.toFixed(2)} Mbps` : ""}</span>
            </div>
          )}
          {selectedHistory && <div className="traffic-replay-banner">Replaying <strong>{selectedHistory.name}</strong> · {selectedHistory.interfaceName} · {selectedHistory.samples.length} samples</div>}
          {(historyError || (isRecording && recordedSampleCount >= MAX_SAMPLES_PER_SESSION)) && <div className="notice notice-error" role="status">{historyError ?? "Recording reached the browser session sample limit. Stop and save this capture."}</div>}

          <div className="traffic-metrics">
            <article className="traffic-card">
              <span>Total traffic</span>

              <strong>
                  {formatBytes(
                  selectedHistory || filters.protocol || filters.peerIp ? visiblePoints.reduce((sum, point) => sum + point.bytes, 0) : traffic?.total_bytes ?? 0,
                )}
              </strong>

              <small>
                last 60 seconds
              </small>
            </article>

            <article className="traffic-card">
              <span>Traffic rate</span>

              <strong>
                  {formatRate(
                  selectedHistory || filters.protocol || filters.peerIp ? (visiblePoints.at(-1)?.bytes ?? 0) : traffic?.bytes_per_second ?? 0,
                )}
              </strong>

              <small>
                current average
              </small>
            </article>

            <article className="traffic-card">
              <span>Packet rate</span>

              <strong>
                  {(
                  selectedHistory || filters.protocol || filters.peerIp ? currentPacketsPerSecond : traffic?.packets_per_second ?? 0
                ).toFixed(1)}
              </strong>

              <small>
                packets / second
              </small>
            </article>

            <article className="traffic-card">
              <span>Total packets</span>

              <strong>
                  {(
                  selectedHistory || filters.protocol || filters.peerIp ? visiblePoints.reduce((sum, point) => sum + point.packets, 0) : traffic?.total_packets ?? 0
                ).toLocaleString()}
              </strong>

              <small>
                captured packets
              </small>
            </article>
          </div>

          <div className="traffic-direction-summary">
            <article>
              <span>Upload</span>

              <strong>
                {formatBytes(
                  selectedHistory || filters.protocol || filters.peerIp ? visiblePoints.reduce((sum, point) => sum + (point.upload_bytes ?? 0), 0) : traffic?.upload_bytes ?? 0,
                )}
              </strong>
            </article>

            <article>
              <span>Download</span>

              <strong>
                {formatBytes(
                  selectedHistory || filters.protocol || filters.peerIp ? visiblePoints.reduce((sum, point) => sum + (point.download_bytes ?? 0), 0) : traffic?.download_bytes ?? 0,
                )}
              </strong>
            </article>

            <article>
              <span>Local IP</span>

              <strong>
                {traffic?.local_ip ?? "—"}
              </strong>
            </article>
          </div>

          <div className="traffic-chart-grid">
            <article className="traffic-chart-card">
              <div className="traffic-card-heading">
                <div>
                  <h3>
                    Traffic over time
                  </h3>

                  <p>
                    Packets captured per second
                  </p>
                </div>
              </div>

              <div className="traffic-chart">
                {chartData.length > 0 ? (
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <LineChart
                      data={chartData}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={dark ? "#3b3d48" : "#d8dee8"}
                      />

                      <XAxis
                        dataKey="time"
                        tick={{ fill: dark ? "#a1a4b1" : "#64748b", fontSize: 11 }}
                        axisLine={{ stroke: dark ? "#555866" : "#cbd5e1" }}
                        tickLine={{ stroke: dark ? "#555866" : "#cbd5e1" }}
                      />

                      <YAxis
                        tick={{ fill: dark ? "#a1a4b1" : "#64748b", fontSize: 11 }}
                        axisLine={{ stroke: dark ? "#555866" : "#cbd5e1" }}
                        tickLine={{ stroke: dark ? "#555866" : "#cbd5e1" }}
                      />

                      <Tooltip
                        contentStyle={{
                          background: dark ? "#25272f" : "#ffffff",
                          border: `1px solid ${dark ? "#454752" : "#d8dee8"}`,
                          color: dark ? "#e4e5eb" : "#263238",
                        }}
                        labelStyle={{ color: dark ? "#e4e5eb" : "#263238" }}
                      />

                      <Line
                        type="monotone"
                        dataKey="packets"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty">
                    Waiting for traffic...
                  </div>
                )}
              </div>
            </article>

            <article className="traffic-chart-card">
              <div className="traffic-card-heading">
                <div>
                  <h3>
                    Protocol distribution
                  </h3>

                  <p>
                    Traffic grouped by IPv4 protocol
                  </p>
                </div>
              </div>

              <div className="traffic-chart">
                {protocolData.length > 0 ? (
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <BarChart
                      data={protocolData}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={dark ? "#3b3d48" : "#d8dee8"}
                      />

                      <XAxis
                        dataKey="protocol"
                        tick={{ fill: dark ? "#a1a4b1" : "#64748b", fontSize: 11 }}
                        axisLine={{ stroke: dark ? "#555866" : "#cbd5e1" }}
                        tickLine={{ stroke: dark ? "#555866" : "#cbd5e1" }}
                      />

                      <YAxis
                        tick={{ fill: dark ? "#a1a4b1" : "#64748b", fontSize: 11 }}
                        axisLine={{ stroke: dark ? "#555866" : "#cbd5e1" }}
                        tickLine={{ stroke: dark ? "#555866" : "#cbd5e1" }}
                      />

                      <Tooltip
                        contentStyle={{
                          background: dark ? "#25272f" : "#ffffff",
                          border: `1px solid ${dark ? "#454752" : "#d8dee8"}`,
                          color: dark ? "#e4e5eb" : "#263238",
                        }}
                        labelStyle={{ color: dark ? "#e4e5eb" : "#263238" }}
                      />

                      <Bar
                        dataKey="packets"
                        name="Packets"
                        fill={dark ? "#a855f7" : "#1769aa"}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty">
                    Waiting for traffic...
                  </div>
                )}
              </div>
            </article>
          </div>

          <div className="traffic-bottom-grid">
            <article className="traffic-panel">
              <div className="traffic-card-heading">
                <h3>
                  Traffic direction
                </h3>
              </div>

              {directionData.length > 0 ? (
                <div className="traffic-list">
                  {directionData.map(
                    (item) => (
                      <div
                        className="traffic-list-row"
                        key={item.direction}
                      >
                        <span>
                          {item.direction}
                        </span>

                        <strong>
                          {item.packets.toLocaleString()}{" "}
                          packets
                        </strong>

                        <small>
                          {formatBytes(
                            item.bytes,
                          )}
                        </small>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <div className="panel-empty">
                  No direction data yet.
                </div>
              )}
            </article>

            <article className="traffic-panel">
              <div className="traffic-card-heading">
                <h3>
                  Top network peers
                </h3>
              </div>

              {visiblePeers.length ? (
                <div className="traffic-list">
                  {visiblePeers.map(
                    (peer) => (
                      <div
                        className="traffic-list-row"
                        key={`${peer.ip_address}-${peer.direction}`}
                      >
                        <span>
                          {peer.ip_address}
                        </span>

                        <strong>
                          {peer.direction}
                        </strong>

                        <small>
                          {formatBytes(
                            peer.bytes,
                          )}
                        </small>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <div className="panel-empty">
                  No peer traffic detected yet.
                </div>
              )}
            </article>
          </div>
        </>
      )}
    </section>
  );
}
