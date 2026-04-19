import { BrowserRouter, Routes, Route } from "react-router-dom";

import { CameraFocusProvider } from "./context/CameraFocusContext.jsx";
import DashboardLayout from "./layouts/DashboardLayout.jsx";
import HomePage from "./pages/HomePage.jsx";
import RankingPage from "./pages/RankingPage.jsx";
import DossiePage from "./pages/DossiePage.jsx";
import LoginPage from "./pages/LoginPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <CameraFocusProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route element={<DashboardLayout />}>
            <Route path="/ranking" element={<RankingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dossie/:id" element={<DossiePage />} />
          </Route>
        </Routes>
      </CameraFocusProvider>
    </BrowserRouter>
  );
}
