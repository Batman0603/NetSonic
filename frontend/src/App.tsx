import { useEffect, useState } from "react";
import { ApiError, getHealth, type HealthResponse } from "./services/api";
import "./App.css";

type ConnectionState = "checking" | "connected" | "error";

function App() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function checkBackend(): Promise<void> {
    setConnectionState("checking");
    setErrorMessage(null);

    try {
      const result = await getHealth();
      setHealth(result);
      setConnectionState("connected");
    } catch (error) {
      setHealth(null);
      setConnectionState("error");

      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("An unexpected error occurred.");
      }
    }
  }

  useEffect(() => {
    void checkBackend();
  }, []);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Network visibility and sonification</p>
          <h1>NetSonic</h1>
          <p className="subtitle">
            See the network. Hear the network.
          </p>
        </div>

        <span
          className={`status-pill status-${connectionState}`}
          role="status"
          aria-live="polite"
        >
          {connectionState === "checking" && "Checking backend"}
          {connectionState === "connected" && "Backend connected"}
          {connectionState === "error" && "Backend unavailable"}
        </span>
      </header>

      <section className="welcome-card">
        <div>
          <h2>Project foundation</h2>
          <p>
            NetSonic is being built to discover local network devices,
            visualize observed network relationships, and translate
            aggregated traffic activity into sound.
          </p>
        </div>

        <div className="connection-panel">
          <h3>API connection</h3>

          {connectionState === "checking" && (
            <p>Contacting the backend...</p>
          )}

          {connectionState === "connected" && health && (
            <div>
              <p className="success-message">
                API is responding successfully.
              </p>
              <dl>
                <dt>Application</dt>
                <dd>{health.app_name}</dd>
                <dt>Version</dt>
                <dd>{health.version}</dd>
                <dt>Status</dt>
                <dd>{health.status}</dd>
              </dl>
            </div>
          )}

          {connectionState === "error" && (
            <div>
              <p className="error-message">{errorMessage}</p>
              <button type="button" onClick={() => void checkBackend()}>
                Retry connection
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="phase-grid" aria-label="Project modules">
        <article className="module-card">
          <span className="module-number">01</span>
          <h3>Device discovery</h3>
          <p>Identify devices visible on an authorized local network.</p>
          <span className="module-state">Planned</span>
        </article>

        <article className="module-card">
          <span className="module-number">02</span>
          <h3>Topology visualization</h3>
          <p>Explore devices and evidence-backed network relationships.</p>
          <span className="module-state">Planned</span>
        </article>

        <article className="module-card">
          <span className="module-number">03</span>
          <h3>Traffic sonification</h3>
          <p>Hear aggregated traffic changes through a consistent audio map.</p>
          <span className="module-state">Planned</span>
        </article>
      </section>

      <footer className="app-footer">
        Phase 0 · Foundation and connectivity
      </footer>
    </main>
  );
}

export default App;