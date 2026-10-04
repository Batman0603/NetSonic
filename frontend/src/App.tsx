import { useEffect, useState } from "react";

import "./App.css";

import { DiscoveryPanel } from "./components/DiscoveryPanel";
import { TopologyView } from "./components/TopologyView";

import {
  getInterfaces,
  type NetworkInterface,
} from "./services/discovery";

function App() {
  const [interfaces, setInterfaces] =
    useState<NetworkInterface[]>([]);

  const [selectedInterface, setSelectedInterface] =
    useState("");

  const [interfaceError, setInterfaceError] =
    useState<string | null>(null);

  useEffect(() => {
    async function loadInterfaces(): Promise<void> {
      try {
        const result = await getInterfaces();

        setInterfaces(result);

        const activeInterface = result.find(
          (item) => item.is_up,
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
          <h1>NetSonic</h1>

          <p>
            See the network. Hear the network.
          </p>
        </div>

        <div className="app-status">
          <span className="status-indicator" />

          <span>
            Network Monitoring
          </span>
        </div>
      </header>

      <main className="app-main">
        <section className="welcome-section">
          <p className="eyebrow">
            Network intelligence platform
          </p>

          <h2>
            Local Network Discovery &amp; Topology
          </h2>

          <p>
            Discover authorized devices on your local network
            and visualize their logical network relationships.
          </p>
        </section>

        {interfaceError && (
          <div
            className="notice notice-error"
            role="alert"
          >
            {interfaceError}
          </div>
        )}

        <DiscoveryPanel />

        <section className="topology-interface-selector">
          <div>
            <p className="eyebrow">
              Topology source
            </p>

            <h3>
              Select interface
            </h3>

            <p>
              The topology is generated from the selected
              local network interface.
            </p>
          </div>

          <select
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
        </section>

        {selectedInterface && (
          <TopologyView
            interfaceName={selectedInterface}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>
          NetSonic · Local Network Discovery · Phase 2
        </p>
      </footer>
    </div>
  );
}

export default App;