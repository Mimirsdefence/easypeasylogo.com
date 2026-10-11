import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { AppStateProvider } from "./state/AppStateProvider";
import { HelmetProvider } from "react-helmet-async";
import { hasStoredSupabaseSession } from "./lib/storage";

const container = document.getElementById("root")!;

/**
 * Public pages ship prerendered HTML (see script/prerender.ts), which the
 * crawler sees and the browser hydrates. Private pages are prerendered as a
 * shell only, and a browser that already has a session must not hydrate the
 * guest markup — it renders a fresh tree instead.
 */
const canHydrate =
  document.documentElement.dataset.prerender === "public" && !hasStoredSupabaseSession();

const tree = (
  <HelmetProvider>
    {/* initialLoading must match the prerenderer (false) for hydration to line up. */}
    <AppStateProvider initialLoading={!canHydrate}>
      <App />
    </AppStateProvider>
  </HelmetProvider>
);

if (canHydrate) {
  hydrateRoot(container, tree);
} else {
  container.innerHTML = "";
  createRoot(container).render(tree);
}
