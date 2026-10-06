import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import DashboardPage from "./pages/DashboardPage";
import LearnPage from "./pages/LearnPage";
import DeviceDetailsPage from "./pages/DeviceDetailsPage";
import { ThemeProvider } from "./contexts/ThemeProvider";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/devices/:deviceId" element={<DeviceDetailsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
