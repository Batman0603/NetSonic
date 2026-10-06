import type { Device } from "../services/discovery";
import { Link } from "react-router-dom";

interface DeviceTableProps {
  devices: Device[];
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString();
}

export function DeviceTable({ devices }: DeviceTableProps) {
  if (devices.length === 0) {
    return (
      <div className="empty-state">
        <h3>No devices discovered yet</h3>
        <p>Select an interface and start a scan to populate the inventory.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="device-table">
        <thead>
          <tr>
            <th>Device</th>
            <th>IP address</th>
            <th>MAC address</th>
            <th>Hostname</th>
            <th>Status</th>
            <th>Last seen</th>
          </tr>
        </thead>

        <tbody>
          {devices.map((device) => (
            <tr key={device.id}>
              <td><Link className="device-detail-link" to={`/devices/${device.id}`}>{device.label ?? device.hostname ?? device.ip_address}</Link></td>
              <td className="mono">{device.ip_address}</td>
              <td className="mono">{device.mac_address ?? "Unavailable"}</td>
              <td>{device.hostname ?? "Unknown device"}</td>
              <td>
                <span className={`device-status status-${device.status}`}>
                  {device.status}
                </span>
              </td>
              <td>{formatDate(device.last_seen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
