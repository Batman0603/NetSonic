import { useEffect, useRef, useState } from "react";
import cytoscape, {
  type Core,
  type ElementDefinition,
} from "cytoscape";
import { useTheme } from "../contexts/ThemeContext";

import {
  getTopology,
  type TopologyNode,
  type TopologyResponse,
} from "../services/topology";

interface TopologyViewProps {
  interfaceName: string;
}

export function TopologyView({
  interfaceName,
}: TopologyViewProps) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  const [topology, setTopology] =
    useState<TopologyResponse | null>(null);

  const [selectedNode, setSelectedNode] =
    useState<TopologyNode | null>(null);

  const [isLoading, setIsLoading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  async function loadTopology(): Promise<void> {
    if (!interfaceName.trim()) {
      setTopology(null);
      setSelectedNode(null);
      setErrorMessage(
        "Select a network interface to display the topology.",
      );
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await getTopology(interfaceName);

      setTopology(result);

      const localNode = result.nodes.find(
        (node) => node.type === "local",
      );

      setSelectedNode(localNode ?? null);
    } catch (error) {
      setTopology(null);
      setSelectedNode(null);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load network topology.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTopology();
  }, [interfaceName]);

  useEffect(() => {
    if (!containerRef.current || !topology) {
      return;
    }

    const elements: ElementDefinition[] = [
      ...topology.nodes.map((node) => ({
        data: {
          id: node.id,
          label: node.label,
          displayLabel: node.ip_address
            ? `${node.label}\n${node.ip_address}`
            : node.label,
          type: node.type,
          ip: node.ip_address ?? "N/A",
          mac: node.mac_address ?? "N/A",
          hostname: node.hostname ?? "N/A",
          status: node.status ?? "unknown",
        },
      })),

      ...topology.edges.map((edge) => ({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          relationship: edge.relationship,
        },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,

      elements,

      minZoom: 0.5,
      maxZoom: 2,
      wheelSensitivity: 0.15,

      layout: {
        name: "breadthfirst",
        directed: true,
        padding: 55,
        spacingFactor: 1.45,
        avoidOverlap: true,
        roots: topology.gateway_ip
          ? [`gateway:${topology.gateway_ip}`]
          : undefined,
      },

      style: [
        {
          selector: "node",
          style: {
            label: "data(displayLabel)",
            shape: "roundrectangle",
            "text-valign": "center",
            "text-halign": "center",
            "text-wrap": "wrap",
            "text-max-width": "140px",
            "font-family":
              "Inter, ui-sans-serif, system-ui, sans-serif",
            "font-size": 11,
            "font-weight": 600,
            color: dark ? "#e3e8ef" : "#263238",
            "background-color": dark ? "#252a33" : "#ffffff",
            width: 150,
            height: 64,
            padding: "8px",
            "border-width": 1,
            "border-color": dark ? "#454d5a" : "#b8c2cc",
            "overlay-opacity": 0,
          },
        },

        {
          selector: 'node[type = "local"]',
          style: {
            "background-color": dark ? "#302746" : "#eef2ff",
            "border-color": dark ? "#9a62e8" : "#4f46e5",
            "border-width": 2,
            color: dark ? "#e0caff" : "#312e81",
            width: 165,
            height: 70,
            "font-weight": 700,
          },
        },

        {
          selector: 'node[type = "gateway"]',
          style: {
            "background-color": dark ? "#18382e" : "#ecfdf5",
            "border-color": dark ? "#2eb879" : "#0f766e",
            "border-width": 2,
            color: dark ? "#a5f0ce" : "#115e59",
            width: 165,
            height: 70,
            "font-weight": 700,
          },
        },

        {
          selector: 'node[type = "device"]',
          style: {
            "background-color": dark ? "#252a33" : "#ffffff",
            "border-color": dark ? "#454d5a" : "#94a3b8",
            color: dark ? "#d5dbe5" : "#334155",
          },
        },

        {
          selector: 'node[status = "online"]',
          style: {
            "border-color": "#22a06b",
          },
        },

        {
          selector: ".selected-node",
          style: {
            "border-width": 3,
            "border-color": "#2563eb",
          },
        },

        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": dark ? "#596273" : "#a8b4c2",
            "target-arrow-color": dark ? "#858fa0" : "#7b8794",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 0.8,
            opacity: 0.85,
          },
        },

        {
          selector: 'edge[relationship = "default-gateway"]',
          style: {
            width: 2.5,
            "line-color": dark ? "#9a62e8" : "#4f46e5",
            "target-arrow-color": dark ? "#9a62e8" : "#4f46e5",
            "arrow-scale": 0.9,
          },
        },
      ],
    });

    cy.on("tap", "node", (event) => {
      const nodeId = event.target.id();

      const selected = topology.nodes.find(
        (node) => node.id === nodeId,
      );

      if (!selected) {
        return;
      }

      cy.nodes().removeClass("selected-node");
      event.target.addClass("selected-node");

      setSelectedNode(selected);
    });

    cy.on("tap", (event) => {
      if (event.target === cy) {
        cy.nodes().removeClass("selected-node");

        const localNode = topology.nodes.find(
          (node) => node.type === "local",
        );

        setSelectedNode(localNode ?? null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [topology, dark]);

  return (
    <section className="topology-section">
      <div className="topology-header">
        <div>
          <div className="topology-title-row">
            <span className="phase-label">PHASE 2</span>

            <span className="topology-live-status">
              <span className="status-dot" />
              LIVE VIEW
            </span>
          </div>

          <h2>Network topology</h2>

          <p className="topology-description">
            Logical relationships inferred from the selected interface,
            default gateway, and discovered local devices.
          </p>
        </div>

        <button
          type="button"
          className="refresh-button"
          onClick={() => void loadTopology()}
          disabled={isLoading || !interfaceName}
        >
          <span>↻</span>
          {isLoading ? "Refreshing..." : "Refresh topology"}
        </button>
      </div>

      {errorMessage && (
        <div className="notice notice-error" role="alert">
          <strong>Topology error:</strong>
          <span>{errorMessage}</span>
        </div>
      )}

      {isLoading && (
        <div className="topology-loading">
          <div className="loading-spinner" />
          <span>Building network topology...</span>
        </div>
      )}

      {!isLoading && topology && (
        <>
          <div className="topology-metrics">
            <div className="topology-metric">
              <span>INTERFACE</span>
              <strong>{topology.interface_name}</strong>
            </div>

            <div className="topology-metric">
              <span>LOCAL IP</span>
              <strong>{topology.interface_ip}</strong>
            </div>

            <div className="topology-metric">
              <span>SUBNET</span>
              <strong>{topology.subnet}</strong>
            </div>

            <div className="topology-metric">
              <span>GATEWAY</span>
              <strong>
                {topology.gateway_ip ?? "Not detected"}
              </strong>
            </div>

            <div className="topology-metric">
              <span>NODES</span>
              <strong>{topology.node_count}</strong>
            </div>

            <div className="topology-metric">
              <span>LINKS</span>
              <strong>{topology.edge_count}</strong>
            </div>
          </div>

          <div className="topology-workspace">
            <div className="topology-map-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">
                    TOPOLOGY MAP
                  </span>

                  <h3>Logical network relationships</h3>
                </div>

                <div className="map-controls">
                  <span>Scroll to zoom</span>
                  <span>Click node for details</span>
                </div>
              </div>

              <div className="topology-legend">
                <span>
                  <i className="legend-dot legend-local" />
                  This device
                </span>

                <span>
                  <i className="legend-dot legend-gateway" />
                  Gateway
                </span>

                <span>
                  <i className="legend-dot legend-device" />
                  Discovered device
                </span>
              </div>

              <div
                ref={containerRef}
                className="topology-canvas"
                aria-label="Network topology visualization"
              />

              <div className="topology-canvas-footer">
                <span>
                  {topology.node_count} nodes
                </span>

                <span className="footer-separator">•</span>

                <span>
                  {topology.edge_count} logical links
                </span>
              </div>
            </div>

            <aside className="node-details-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">
                    NODE DETAILS
                  </span>

                  <h3>Selected node</h3>
                </div>
              </div>

              {selectedNode ? (
                <div className="node-details">
                  <div className="node-identity">
                    <div
                      className={`node-type-icon node-type-${selectedNode.type}`}
                    >
                      {selectedNode.type === "local"
                        ? "PC"
                        : selectedNode.type === "gateway"
                          ? "GW"
                          : "DV"}
                    </div>

                    <div>
                      <strong>{selectedNode.label}</strong>

                      <span>
                        {selectedNode.type === "local"
                          ? "Local device"
                          : selectedNode.type === "gateway"
                            ? "Default gateway"
                            : "Discovered device"}
                      </span>
                    </div>
                  </div>

                  <div className="node-status-row">
                    <span
                      className={
                        selectedNode.status === "online"
                          ? "device-status status-online"
                          : "device-status"
                      }
                    >
                      <span className="mini-status-dot" />
                      {selectedNode.status ?? "unknown"}
                    </span>
                  </div>

                  <dl className="node-properties">
                    <div>
                      <dt>IP address</dt>
                      <dd>{selectedNode.ip_address ?? "N/A"}</dd>
                    </div>

                    <div>
                      <dt>MAC address</dt>
                      <dd className="mono">
                        {selectedNode.mac_address ?? "N/A"}
                      </dd>
                    </div>

                    <div>
                      <dt>Hostname</dt>
                      <dd>
                        {selectedNode.hostname ?? "N/A"}
                      </dd>
                    </div>

                    <div>
                      <dt>Node type</dt>
                      <dd>{selectedNode.type}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <div className="node-details-empty">
                  <span>—</span>
                  <p>Select a topology node to inspect its details.</p>
                </div>
              )}
            </aside>
          </div>

          <div className="topology-note">
            <strong>Topology scope:</strong>
            <span>
              Links represent logical inferences from local network
              information and the detected gateway. They do not confirm
              physical switch, router, or wireless access-point paths.
            </span>
          </div>
        </>
      )}
    </section>
  );
}
