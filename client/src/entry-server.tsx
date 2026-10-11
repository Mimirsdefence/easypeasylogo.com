/**
 * Build-time server entry
 * ---------------------------------------------------------------------------
 * Used ONLY by `script/prerender.ts` during `npm run build`. It is never
 * shipped to the browser and never used to serve requests — the app stays a
 * static SPA; we only pre-bake HTML for the public routes so crawlers and AI
 * answer engines see the content without running JavaScript.
 *
 * Two things make this render possible:
 *   - `AppStateProvider initialLoading={false}` — otherwise the auth gate
 *     would prerender "Loading..." instead of the page.
 *   - `wouter`'s `ssrPath` — the only source of routing information on the
 *     server, since there is no `window.location`.
 *
 * Every head tag Helmet emits carries `data-rh="true"`, which is exactly how
 * the client-side Helmet finds and replaces those tags on hydration.
 */

import { renderToString } from "react-dom/server";
import { HelmetProvider, type HelmetServerState } from "react-helmet-async";
import { Router } from "wouter";
import App from "./App";
import { AppStateProvider } from "./state/AppStateProvider";

export interface PrerenderResult {
  /**
   * The route's complete head content (title, meta, link, JSON-LD), rendered
   * by Helmet. Every tag carries `data-rh="true"` so the client takes over
   * cleanly instead of duplicating tags.
   */
  headHtml: string;
  /** Markup to place inside `<div id="root">`. */
  bodyHtml: string;
}

export function renderRoute(path: string): PrerenderResult {
  const helmetContext: { helmet?: HelmetServerState | null } = {};

  const bodyHtml = renderToString(
    <HelmetProvider context={helmetContext}>
      <Router ssrPath={path}>
        <AppStateProvider initialLoading={false}>
          <App />
        </AppStateProvider>
      </Router>
    </HelmetProvider>,
  );

  const { helmet } = helmetContext;
  const headHtml = [helmet?.title, helmet?.meta, helmet?.link, helmet?.script]
    .filter((chunk): chunk is Exclude<typeof chunk, undefined | null> => Boolean(chunk))
    .map((chunk) => chunk.toString())
    .join("\n");

  return { headHtml, bodyHtml };
}
