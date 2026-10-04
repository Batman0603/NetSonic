import { useEffect, useState } from "react";

import "./App.css";

import { DiscoveryPanel } from "./components/DiscoveryPanel";
import { TopologyView } from "./components/TopologyView";

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
            PHASE 2
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="dashboard-intro">
          <div>
            <p className="eyebrow">NETWORK INTELLIGENCE PLATFORM</p>

            <h2>Local Network Discovery &amp; Topology</h2>

            <p className="intro-description">
              Discover authorized devices, inspect network interfaces,
              and visualize logical relationships across the local network.
            </p>
          </div>

          <div className="intro-status">
            <span className="status-dot" />
            <div>
              <strong>LOCAL NETWORK</strong>
              <span>Monitoring active</span>
            </div>
          </div>
        </section>

        {interfaceError && (
          <div className="notice notice-error" role="alert">
            <strong>Interface error:</strong>
            <span>{interfaceError}</span>
          </div>
        )}

        <DiscoveryPanel />

        <section className="interface-toolbar">
          <div className="interface-toolbar-info">
            <div className="toolbar-icon">⌁</div>

            <div>
              <p className="eyebrow">TOPOLOGY SOURCE</p>
              <h3>Network interface</h3>
              <p>
                Select the interface used as the source for topology
                construction.
              </p>
            </div>
          </div>

          <div className="interface-selector-wrapper">
            <label htmlFor="topology-interface">
              Interface
            </label>

            <select
              id="topology-interface"
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
                  {!networkInterface.is_up ? " (down)" : ""}
                </option>
              ))}
            </select>
          </div>
        </section>

        {selectedInterface ? (
          <TopologyView interfaceName={selectedInterface} />
        ) : (
          <section className="topology-empty">
            <div className="empty-icon">⌁</div>
            <h3>No network interface selected</h3>
            <p>
              Select an active interface above to build the logical
              network topology.
            </p>
          </section>
        )}
      </main>

      <footer className="app-footer">
        <span>NetSonic</span>
        <span>Local Network Discovery</span>
        <span>Phase 2</span>
      </footer>
    </div>
  );
}

export default App;
