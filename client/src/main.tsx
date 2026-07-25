import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { AppStateProvider } from "./state/AppStateProvider";
import { HelmetProvider } from "react-helmet-async";

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </HelmetProvider>
);
