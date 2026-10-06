import { useEffect, useState } from "react";
import type { TrafficFilters } from "../services/traffic";

import "../App.css";
import "./DashboardPage.css";

import { DiscoveryPanel } from "../components/DiscoveryPanel";
import { TopologyView } from "../components/TopologyView";
import { TrafficMonitor } from "../components/TrafficMonitor";
import { SonificationPanel } from "../components/SonificationPanel";
import { ThemeToggle } from "../components/ThemeToggle";
import { OnboardingGuide } from "../components/OnboardingGuide";
import { NetworkInsights } from "../components/NetworkInsights";

type DashboardPanel = "discovery" | "topology" | "traffic" | "sonification";
interface DashboardLayout {
  order: DashboardPanel[];
  visible: Record<DashboardPanel, boolean>;
}

const DEFAULT_LAYOUT: DashboardLayout = {
  order: ["discovery", "topology", "traffic", "sonification"],
  visible: { discovery: true, topology: true, traffic: true, sonification: true },
};

function readDashboardLayout(): DashboardLayout {
  try {
    const saved = localStorage.getItem("netsonic.dashboard.layout");
    if (!saved) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(saved) as Partial<DashboardLayout>;
    const order = Array.isArray(parsed.order)
      ? [...new Set(parsed.order.filter((item): item is DashboardPanel =>
        DEFAULT_LAYOUT.order.includes(item as DashboardPanel),
      ))]
      : [];
    for (const panel of DEFAULT_LAYOUT.order) {
      if (!order.includes(panel)) order.push(panel);
    }
    return {
      order,
      visible: { ...DEFAULT_LAYOUT.visible, ...parsed.visible },
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

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

  const [trafficFilters, setTrafficFilters] = useState<TrafficFilters>({
    protocol: "",
    peerIp: "",
  });

  const [dashboardLayout, setDashboardLayout] = useState(readDashboardLayout);

  useEffect(() => {
    try {
      localStorage.setItem(
        "netsonic.dashboard.layout",
        JSON.stringify(dashboardLayout),
      );
    } catch {
      // Keep layout changes for this visit if storage is unavailable.
    }
  }, [dashboardLayout]);

  function movePanel(panel: DashboardPanel, offset: -1 | 1) {
    setDashboardLayout((current) => {
      const order = [...current.order];
      const index = order.indexOf(panel);
      const nextIndex = index + offset;
      if (nextIndex < 0 || nextIndex >= order.length) return current;
      [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
      return { ...current, order };
    });
  }

  function setPanelVisible(panel: DashboardPanel, visible: boolean) {
    setDashboardLayout((current) => ({
      ...current,
      visible: { ...current.visible, [panel]: visible },
    }));
  }

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

  const visiblePanels = dashboardLayout.order
    .filter((panel) => dashboardLayout.visible[panel])
    .filter((panel) => panel !== "sonification" || Boolean(selectedInterface));

  function renderPanel(panel: DashboardPanel) {
    if (panel === "discovery") {
      return (
        <section className="dashboard-widget dashboard-discovery" id="discovery" key={panel}>
          <DiscoveryPanel />
        </section>
      );
    }
    if (panel === "topology") {
      return selectedInterface ? (
        <section className="dashboard-widget dashboard-topology" id="topology" key={panel}>
          <TopologyView interfaceName={selectedInterface} />
        </section>
      ) : (
        <section className="dashboard-widget dashboard-empty" id="topology" key={panel}>
          <div className="empty-icon">⌁</div>
          <h3>No network interface selected</h3>
          <p>Select an active interface above to build the topology and start traffic sonification.</p>
        </section>
      );
    }
    if (panel === "traffic") {
      return (
        <section className="dashboard-widget dashboard-traffic" id="traffic" key={panel}>
          <TrafficMonitor
            key={selectedInterface}
            interfaceName={selectedInterface}
            filters={trafficFilters}
            onFiltersChange={setTrafficFilters}
          />
        </section>
      );
    }
    return (
      <section className="dashboard-widget dashboard-sonification" id="sonification" key={panel}>
        <SonificationPanel interfaceName={selectedInterface} filters={trafficFilters} />
      </section>
    );
  }

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
          <ThemeToggle />
          <a href="/learn" className="learn-nav-link">
            Learn NetSonic
          </a>

          <div className="monitor-status">
            <span className="status-indicator status-online-indicator" />

            <span>
              Network Monitoring
            </span>
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
        <details className="dashboard-layout-editor">
          <summary>Customize dashboard</summary>
          <div className="dashboard-layout-editor-content">
            <p>Choose visible panels and change their display order. Preferences are saved in this browser.</p>
            {dashboardLayout.order.map((panel, index) => (
              <div className="dashboard-layout-row" key={panel}>
                <label>
                  <input
                    type="checkbox"
                    checked={dashboardLayout.visible[panel]}
                    onChange={(event) => setPanelVisible(panel, event.target.checked)}
                  />
                  {panel[0].toUpperCase() + panel.slice(1)}
                </label>
                <div>
                  <button type="button" onClick={() => movePanel(panel, -1)} disabled={index === 0} aria-label={`Move ${panel} up`}>↑</button>
                  <button type="button" onClick={() => movePanel(panel, 1)} disabled={index === dashboardLayout.order.length - 1} aria-label={`Move ${panel} down`}>↓</button>
                </div>
              </div>
            ))}
          </div>
        </details>
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

        <OnboardingGuide hasInterface={Boolean(selectedInterface)} />

        <section className="interface-toolbar" id="network-source">
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
          {visiblePanels.filter((panel) => panel === "discovery" || panel === "topology").map(renderPanel)}
        </div>

        <NetworkInsights interfaceName={selectedInterface} />

        <div className="dashboard-grid">
          {visiblePanels.filter((panel) => panel === "traffic" || panel === "sonification").map(renderPanel)}
        </div>
      </main>

      <footer className="app-footer">
        <span>NetSonic</span>

        <span>
          Local Network Intelligence
        </span>
      </footer>
    </div>
  );
}

export default DashboardPage;
