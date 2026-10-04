import { useEffect, useState } from "react";

import "../App.css";
import "./DashboardPage.css";

import { DiscoveryPanel } from "../components/DiscoveryPanel";
import { TopologyView } from "../components/TopologyView";
import { TrafficMonitor } from "../components/TrafficMonitor";
import { SonificationPanel } from "../components/SonificationPanel";

import {
  getInterfaces,
  type NetworkInterface,
} from "../services/discovery";

function DashboardPage() {
  const [interfaces, setInterfaces] =
    useState<NetworkInterface[]>([]);

  const [selectedInterface, setSelectedInterface] =
    useState("");

  const [interfaceError, setInterfaceError] =
    useState<string | null>(null);

  useEffect(() => {
    async function loadInterfaces(): Promise<void> {
      try {
        setInterfaceError(null);

        const result =
          await getInterfaces();

        setInterfaces(result);

        const activeInterface =
          result.find(
            (networkInterface) =>
              networkInterface.is_up,
          );

        if (activeInterface) {
          setSelectedInterface(
            activeInterface.name,
          );
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
    <div className="app dashboard-shell">
      <header className="app-header">
        <div className="app-brand">
          <div className="brand-mark">
            NS
          </div>

          <div>
            <h1>NetSonic</h1>

            <p>
              See the network. Hear the network.
            </p>
          </div>
        </div>

        <div className="app-header-right">
          <a href="/learn" className="learn-nav-link">
            Learn NetSonic
          </a>

          <div className="monitor-status">
            <span className="status-indicator status-online-indicator" />

            <span>
              Network Monitoring
            </span>
          </div>

          <div className="header-version">
            PHASE 4
          </div>
        </div>
      </header>

      <nav className="dashboard-nav" aria-label="Main navigation">
        <a className="dashboard-nav-active" href="#overview">Overview</a>
        <a href="#discovery">Discovery</a>
        <a href="#topology">Topology</a>
        <a href="#traffic">Traffic</a>
        <a href="#sonification">Sonification</a>
      </nav>

      <main className="app-main">
        <section className="dashboard-intro" id="overview">
          <div>
            <p className="eyebrow">
              NETWORK INTELLIGENCE PLATFORM
            </p>

            <h2>
              Discovery, Topology, Traffic &amp;
              Sonification
            </h2>

            <p className="intro-description">
              Discover authorized devices,
              visualize logical network
              relationships, monitor traffic,
              and translate network activity
              into adaptive audio.
            </p>
          </div>

          <div className="intro-status">
            <span className="status-dot" />

            <div>
              <strong>
                LOCAL NETWORK
              </strong>

              <span>
                Monitoring active
              </span>
            </div>
          </div>
        </section>

        {interfaceError && (
          <div
            className="notice notice-error"
            role="alert"
          >
            <strong>
              Interface error:
            </strong>

            <span>
              {interfaceError}
            </span>
          </div>
        )}

        <section className="interface-toolbar">
          <div className="interface-toolbar-info">
            <div className="toolbar-icon">
              ⌁
            </div>

            <div>
              <p className="eyebrow">
                NETWORK SOURCE
              </p>

              <h3>
                Network interface
              </h3>

              <p>
                Select the interface used for
                discovery, topology, traffic
                monitoring, and sonification.
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
                setSelectedInterface(
                  event.target.value,
                )
              }
            >
              <option value="">
                Select an interface
              </option>

              {interfaces.map(
                (networkInterface) => (
                  <option
                    key={
                      networkInterface.name
                    }
                    value={
                      networkInterface.name
                    }
                    disabled={
                      !networkInterface.is_up
                    }
                  >
                    {
                      networkInterface.name
                    }{" "}
                    —{" "}
                    {
                      networkInterface.ipv4_address
                    }
                    {!networkInterface.is_up
                      ? " (down)"
                      : ""}
                  </option>
                ),
              )}
            </select>
          </div>
        </section>

        <div className="dashboard-grid">
          <div className="dashboard-column dashboard-left-column">
            <section className="dashboard-widget dashboard-discovery" id="discovery">
              <DiscoveryPanel />
            </section>

            {selectedInterface ? (
              <section className="dashboard-widget dashboard-topology" id="topology">
                <TopologyView interfaceName={selectedInterface} />
              </section>
            ) : (
              <section className="dashboard-widget dashboard-empty" id="topology">
                <div className="empty-icon">⌁</div>
                <h3>No network interface selected</h3>
                <p>Select an active interface above to build the topology and start traffic sonification.</p>
              </section>
            )}
          </div>

          <div className="dashboard-column dashboard-right-column">
            <section className="dashboard-widget dashboard-traffic" id="traffic">
              <TrafficMonitor interfaceName={selectedInterface} />
            </section>
          </div>
        </div>

        {selectedInterface && (
          <section className="dashboard-widget dashboard-sonification" id="sonification">
            <SonificationPanel interfaceName={selectedInterface} />
          </section>
        )}
      </main>

      <footer className="app-footer">
        <span>NetSonic</span>

        <span>
          Local Network Intelligence
        </span>

        <span>
          Phase 4
        </span>
      </footer>
    </div>
  );
}

export default DashboardPage;
