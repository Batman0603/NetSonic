import { useEffect, useMemo, useState } from "react";

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
  type TrafficSnapshot,
  type TrafficStatus,
} from "../services/traffic";

import "./TrafficMonitor.css";
import { useTheme } from "../contexts/ThemeContext";

interface TrafficMonitorProps {
  interfaceName: string;
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

export function TrafficMonitor({
  interfaceName,
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
  }, [interfaceName, isMonitoring]);

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

  const chartData = useMemo(() => {
    if (!traffic) {
      return [];
    }

    return traffic.timeseries.map(
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
  }, [traffic]);

  const protocolData =
    traffic?.protocols ?? [];

  const directionData =
    traffic?.directions ?? [];

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

          <div className="traffic-metrics">
            <article className="traffic-card">
              <span>Total traffic</span>

              <strong>
                {formatBytes(
                  traffic?.total_bytes ?? 0,
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
                  traffic?.bytes_per_second ?? 0,
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
                  traffic?.packets_per_second ?? 0
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
                  traffic?.total_packets ?? 0
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
                  traffic?.upload_bytes ?? 0,
                )}
              </strong>
            </article>

            <article>
              <span>Download</span>

              <strong>
                {formatBytes(
                  traffic?.download_bytes ?? 0,
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

              {traffic?.peers.length ? (
                <div className="traffic-list">
                  {traffic.peers.map(
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
