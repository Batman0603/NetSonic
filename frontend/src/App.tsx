import "./App.css";
import { DiscoveryPanel } from "./components/DiscoveryPanel";
function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <h1>NetSonic</h1>
          <p>See the network. Hear the network.</p>
        </div>

        <div className="app-status">
          <span className="status-indicator" />
          <span>Network Discovery</span>
        </div>
      </header>

      <main className="app-main">
        <section className="welcome-section">
          <h2>Network Discovery Dashboard</h2>
          <p>
            Discover devices on your authorized local network and view their
            network details.
          </p>
        </section>

        <DiscoveryPanel />
      </main>

      <footer className="app-footer">
        <p>NetSonic · Local Network Discovery</p>
      </footer>
    </div>
  );
}

export default App;