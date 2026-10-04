import { useEffect, useRef, useState } from "react";
import cytoscape, {
  type Core,
  type ElementDefinition,
} from "cytoscape";

import { getTopology, type TopologyResponse } from "../services/topology";

interface TopologyViewProps {
  interfaceName: string;
}

export function TopologyView({
  interfaceName,
}: TopologyViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  const [topology, setTopology] =
    useState<TopologyResponse | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  async function loadTopology(): Promise<void> {
    if (!interfaceName) {
      setTopology(null);
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
    } catch (error) {
      setTopology(null);

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
          type: node.type,
          ip: node.ip_address ?? "N/A",
          mac: node.mac_address ?? "N/A",
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

      layout: {
        name: "breadthfirst",
        directed: true,
        padding: 45,
        spacingFactor: 1.25,
        avoidOverlap: true,
        roots: topology.gateway_ip
          ? [`gateway:${topology.gateway_ip}`]
          : undefined,
      },

      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 10,
            "font-size": 12,
            color: "#172033",
            "background-color": "#64748b",
            width: 48,
            height: 48,
            "border-width": 3,
            "border-color": "#ffffff",
            "overlay-opacity": 0,
          },
        },

        {
          selector: 'node[type = "local"]',
          style: {
            label: "data(label)",
            "background-color": "#4f46e5",
            "border-color": "#3730a3",
            width: 58,
            height: 58,
            "font-weight": 700,
          },
        },

        {
          selector: 'node[type = "gateway"]',
          style: {
            label: "data(label)",
            "background-color": "#0f766e",
            "border-color": "#115e59",
            width: 64,
            height: 64,
            "font-weight": 700,
          },
        },

        {
          selector: 'node[type = "device"]',
          style: {
            label: "data(label)",
            "background-color": "#64748b",
            "border-color": "#475569",
          },
        },

        {
          selector: 'node[status = "online"]',
          style: {
            "border-color": "#22c55e",
          },
        },

        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": "#cbd5e1",
            "target-arrow-color": "#94a3b8",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            opacity: 0.9,
          },
        },

        {
          selector: 'edge[relationship = "default-gateway"]',
          style: {
            width: 3,
            "line-color": "#4f46e5",
            "target-arrow-color": "#4f46e5",
          },
        },
      ],
    });

    cy.on("tap", "node", (event) => {
      const node = event.target;

      const label = node.data("label");
      const ip = node.data("ip");
      const mac = node.data("mac");
      const status = node.data("status");

      node.data(
        "label",
        `${label}\n${ip}\n${status}`,
      );

      window.setTimeout(() => {
        node.data("label", label);
      }, 2500);

      console.info("NetSonic topology node", {
        label,
        ip,
        mac,
        status,
      });
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [topology]);

  return (
    <section className="topology-section">
      <div className="topology-header">
        <div>
          <p className="eyebrow">Phase 2</p>

          <h2>Network topology</h2>

          <p className="topology-description">
            Logical topology inferred from the selected interface,
            default gateway, and discovered local devices.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => void loadTopology()}
          disabled={isLoading || !interfaceName}
        >
          {isLoading ? "Loading..." : "Refresh topology"}
        </button>
      </div>

      {errorMessage && (
        <div className="notice notice-error" role="alert">
          {errorMessage}
        </div>
      )}

      {isLoading && (
        <div className="topology-loading">
          Building network topology...
        </div>
      )}

      {!isLoading && topology && (
        <>
          <div className="topology-summary">
            <div className="topology-stat">
              <span>Interface</span>
              <strong>{topology.interface_name}</strong>
            </div>

            <div className="topology-stat">
              <span>Local IP</span>
              <strong>{topology.interface_ip}</strong>
            </div>

            <div className="topology-stat">
              <span>Subnet</span>
              <strong>{topology.subnet}</strong>
            </div>

            <div className="topology-stat">
              <span>Gateway</span>
              <strong>
                {topology.gateway_ip ?? "Not detected"}
              </strong>
            </div>

            <div className="topology-stat">
              <span>Nodes</span>
              <strong>{topology.node_count}</strong>
            </div>

            <div className="topology-stat">
              <span>Links</span>
              <strong>{topology.edge_count}</strong>
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

          <p className="topology-note">
            Topology links are logical inferences based on the local
            network and gateway. They do not represent confirmed
            physical switch or wireless access-point connections.
          </p>
        </>
      )}
    </section>
  );
}