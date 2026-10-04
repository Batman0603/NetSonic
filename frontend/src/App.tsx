import { useEffect, useState } from "react";

import "./App.css";

import { DiscoveryPanel } from "./components/DiscoveryPanel";
import { TopologyView } from "./components/TopologyView";
import { TrafficMonitor } from "./components/TrafficMonitor";

import {
  getInterfaces,
  type NetworkInterface,
} from "./services/discovery";

function App() {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [selectedInterface, setSelectedInterface] = useState("");
  const [interfaceError, setInterfaceError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInterfaces(): Promise<void> {
      try {
        setInterfaceError(null);

        const result = await getInterfaces();

        setInterfaces(result);

        const activeInterface = result.find(
          (networkInterface) => networkInterface.is_up,
        );

        if (activeInterface) {
          setSelectedInterface(activeInterface.name);
        }
      } catch (error) {
        setInterfaceError(
          error instanceof Error
            ? error.message
            : "Unable to load network interfaces.",
        );
      }
    }

    void loadInterfaces();
  }, []);

  return (
    <div className="app">
      {/* =========================================================
          HEADER
      ========================================================= */}
      <header className="app-header">
        <div className="app-brand">
          <div className="brand-mark">NS</div>

          <div>
            <h1>NetSonic</h1>
            <p>See the network. Hear the network.</p>
          </div>
        </div>

        <div className="app-header-right">
          <div className="monitor-status">
            <span className="status-indicator status-online-indicator" />
            <span>Network Monitoring</span>
          </div>

          <div className="header-version">
            PHASE 3
          </div>
        </div>
      </header>

      {/* =========================================================
          MAIN DASHBOARD
      ========================================================= */}
      <main className="app-main">
        {/* -------------------------------------------------------
            INTRO
        ------------------------------------------------------- */}
        <section className="dashboard-intro">
          <div>
            <p className="eyebrow">
              NETWORK INTELLIGENCE PLATFORM
            </p>

            <h2>
              Local Network Discovery, Topology &amp; Traffic
            </h2>

            <p className="intro-description">
              Discover authorized devices, inspect network interfaces,
              visualize logical relationships, and monitor live network
              traffic across the selected interface.
            </p>
          </div>

          <div className="intro-status">
            <span className="status-dot" />

            <div>
              <strong>LOCAL NETWORK</strong>
              <span>Monitoring available</span>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------
            INTERFACE ERROR
        ------------------------------------------------------- */}
        {interfaceError && (
          <div
            className="notice notice-error"
            role="alert"
          >
            <strong>Interface error:</strong>
            <span>{interfaceError}</span>
          </div>
        )}

        {/* =======================================================
            PHASE 1 — NETWORK DISCOVERY
        ======================================================= */}
        <DiscoveryPanel />

        {/* =======================================================
            NETWORK INTERFACE SELECTOR
        ======================================================= */}
        <section className="interface-toolbar">
          <div className="interface-toolbar-info">
            <div className="toolbar-icon">⌁</div>

            <div>
              <p className="eyebrow">
                NETWORK SOURCE
              </p>

              <h3>
                Network interface
              </h3>

              <p>
                Select the interface used for topology construction
                and live traffic monitoring.
              </p>
            </div>
          </div>

          <div className="interface-selector-wrapper">
            <label htmlFor="network-interface">
              Interface
            </label>

            <select
              id="network-interface"
              value={selectedInterface}
              onChange={(event) =>
                setSelectedInterface(event.target.value)
              }
            >
              <option value="">
                Select an interface
              </option>

              {interfaces.map((networkInterface) => (
                <option
                  key={networkInterface.name}
                  value={networkInterface.name}
                  disabled={!networkInterface.is_up}
                >
                  {networkInterface.name} —{" "}
                  {networkInterface.ipv4_address}
                  {!networkInterface.is_up
                    ? " (down)"
                    : ""}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* =======================================================
            PHASE 2 — NETWORK TOPOLOGY
        ======================================================= */}
        {selectedInterface ? (
          <TopologyView
            interfaceName={selectedInterface}
          />
        ) : (
          <section className="topology-empty">
            <div className="empty-icon">⌁</div>

            <h3>
              No network interface selected
            </h3>

            <p>
              Select an active interface above to build the
              logical network topology.
            </p>
          </section>
        )}

        {/* =======================================================
            PHASE 3 — TRAFFIC MONITORING
        ======================================================= */}
        {selectedInterface ? (
          <TrafficMonitor
            interfaceName={selectedInterface}
          />
        ) : (
          <section className="topology-empty">
            <div className="empty-icon">◌</div>

            <h3>
              Traffic monitoring unavailable
            </h3>

            <p>
              Select an active network interface above to start
              live traffic monitoring.
            </p>
          </section>
        )}
      </main>

      {/* =========================================================
          FOOTER
      ========================================================= */}
      <footer className="app-footer">
        <span>NetSonic</span>
        <span>Local Network Intelligence</span>
        <span>Phase 3</span>
      </footer>
    </div>
  );
}

export default App;