import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";
import App from "./App.jsx";
import { QueryProvider } from "./lib/queryClient.js";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <QueryProvider>
          <App />
        </QueryProvider>
      </HelmetProvider>
    </ErrorBoundary>
  </StrictMode>,
);
