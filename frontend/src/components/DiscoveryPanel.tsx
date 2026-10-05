import { useEffect, useState } from "react";

import {
  getDevices,
  getInterfaces,
  scanNetwork,
  type Device,
  type NetworkInterface,
} from "../services/discovery";

import { DeviceTable } from "./DeviceTable";

export function DiscoveryPanel() {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [selectedInterface, setSelectedInterface] = useState("");
  const [subnet, setSubnet] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadInitialData(): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [interfaceList, deviceResult] = await Promise.all([
        getInterfaces(),
        getDevices(),
      ]);

      setInterfaces(interfaceList);
      setDevices(deviceResult.devices);

      const availableInterface = interfaceList.find(
        (item) => item.is_up,
      );

      if (availableInterface) {
        setSelectedInterface(availableInterface.name);
        setSubnet(availableInterface.cidr);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load discovery data.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadInitialData(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function handleInterfaceChange(interfaceName: string): void {
    setSelectedInterface(interfaceName);

    const selected = interfaces.find(
      (item) => item.name === interfaceName,
    );

    setSubnet(selected?.cidr ?? "");
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  async function handleScan(): Promise<void> {
    if (!selectedInterface) {
      setErrorMessage("Select a network interface before scanning.");
      return;
    }

    setIsScanning(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await scanNetwork(selectedInterface, subnet);
      setDevices(result.devices);
      setSuccessMessage(
        `Scan completed. ${result.discovered_count} responding device(s) found on ${result.subnet}.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The network scan failed.",
      );
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <section className="discovery-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Phase 1</p>
          <h2>Local network discovery</h2>
          <p className="section-description">
            Select an interface and scan an authorized local IPv4 subnet.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadInitialData()}
          disabled={isLoading || isScanning}
          className="secondary-button"
        >
          Refresh
        </button>
      </div>

      <div className="discovery-controls">
        <label>
          Network interface
          <select
            value={selectedInterface}
            onChange={(event) => handleInterfaceChange(event.target.value)}
            disabled={isLoading || isScanning}
          >
            <option value="">Select an interface</option>
            {interfaces.map((item) => (
              <option
                key={item.name}
                value={item.name}
                disabled={!item.is_up}
              >
                {item.name} — {item.ipv4_address}
                {!item.is_up ? " (down)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          IPv4 subnet
          <input
            value={subnet}
            onChange={(event) => setSubnet(event.target.value)}
            placeholder="192.168.1.0/24"
            disabled={isLoading || isScanning}
          />
        </label>

        <button
          type="button"
          onClick={() => void handleScan()}
          disabled={isLoading || isScanning || !selectedInterface || !subnet}
        >
          {isScanning ? "Scanning..." : "Start scan"}
        </button>
      </div>

      {errorMessage && (
        <div className="notice notice-error" role="alert">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="notice notice-success" role="status">
          {successMessage}
        </div>
      )}

      <div className="inventory-heading">
        <div>
          <h3>Discovered devices</h3>
          <p>{devices.length} device record(s) returned</p>
        </div>
      </div>

      {isLoading ? (
        <p className="loading-message">Loading interfaces and devices...</p>
      ) : (
        <DeviceTable devices={devices} />
      )}
    </section>
  );
}
