/**
 * Prerenderer
 * ---------------------------------------------------------------------------
 * Runs after the client build. For every public route it renders the real page
 * with `react-dom/server` and writes the markup + the route's head tags into
 * `dist/public/<route>/index.html`, so crawlers and AI answer engines see the
 * content without executing JavaScript.
 *
 * Private routes (/app, /auth, /profile, …) only get a copy of the shell with a
 * `noindex` head and `data-prerender="private"`: their markup is per-user and
 * meaningless to a crawler. The client clears that shell and renders normally
 * (see client/src/main.tsx).
 *
 * The rendered head comes from Helmet, and every tag carries `data-rh="true"` —
 * the exact marker the client-side Helmet uses to take ownership, so hydration
 * replaces these tags instead of duplicating them.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build as viteBuild } from "vite";
import { PRIVATE_ROUTES, PUBLIC_ROUTES, prerenderOutputFile, seoHeadHtml } from "../shared/seo";

const ROOT = process.cwd();
const PUBLIC_DIR = path.resolve(ROOT, "dist/public");
const SERVER_DIR = path.resolve(ROOT, "dist/server");
const SERVER_ENTRY_FILE = "entry-server.mjs";
const SHELL_FILE = path.join(PUBLIC_DIR, "index.html");

const HEAD_START = "<!--seo-head-start-->";
const HEAD_END = "<!--seo-head-end-->";
const BODY_START = "<!--prerender:start-->";
const BODY_END = "<!--prerender:end-->";

type PrerenderKind = "public" | "private";

interface ServerEntry {
  renderRoute: (path: string) => { headHtml: string; bodyHtml: string };
}

export interface PrerenderSummary {
  publicRoutes: number;
  privateRoutes: number;
}

function replaceBetween(
  html: string,
  markerStart: string,
  markerEnd: string,
  replacement: string,
  description: string,
): string {
  const from = html.indexOf(markerStart);
  const to = html.indexOf(markerEnd);
  if (from === -1 || to === -1 || to < from) {
    throw new Error(`[prerender] ${description}: markers ${markerStart} / ${markerEnd} missing in ${SHELL_FILE}`);
  }
  return `${html.slice(0, from + markerStart.length)}\n${replacement}\n${html.slice(to)}`;
}

/**
 * client/index.html declares charset and viewport statically (they must be
 * present in the shell for the private pages too), so Helmet's copies are
 * dropped here to keep the crawler-facing head free of duplicates.
 */
function stripShellOwnedTags(headHtml: string): string {
  return headHtml.replace(/<(?:meta|link)\b[^>]*>/gi, (tag) => {
    if (/\bcharset=/i.test(tag)) return "";
    if (/\bname="viewport"/i.test(tag)) return "";
    return tag;
  });
}

function markPrerenderKind(shell: string, kind: PrerenderKind): string {
  const marked = shell.replace(/<html\b([^>]*)>/, (_match, attrs: string) => `<html${attrs} data-prerender="${kind}">`);
  if (marked === shell) throw new Error(`[prerender] could not find <html> in ${SHELL_FILE}`);
  return marked;
}

/**
 * Private routes get their head from `seoHeadHtml()` (no React render), so those
 * tags carry no `data-rh` marker yet. Adding it here means the client-side Helmet
 * recognises them as its own and replaces them, instead of leaving the static
 * copies behind next to the tags it renders for the logged-in view.
 */
function markDataRh(headHtml: string): string {
  return headHtml.replace(/<(title|meta|link|script)\b/g, '<$1 data-rh="true"');
}

async function buildServerEntry(): Promise<void> {
  console.log("[prerender] building SSR bundle...");
  await viteBuild({
    logLevel: "warn",
    // react-helmet-async ships CJS only, and Node cannot pick named exports
    // (`Helmet`, `HelmetProvider`) out of CJS. Bundling it avoids that; all
    // other dependencies stay external and load from node_modules as usual.
    ssr: { noExternal: ["react-helmet-async"] },
    build: {
      ssr: path.resolve(ROOT, "client/src/entry-server.tsx"),
      outDir: SERVER_DIR,
      emptyOutDir: true,
      rollupOptions: { output: { entryFileNames: SERVER_ENTRY_FILE } },
    },
  });
}

async function loadServerEntry(): Promise<ServerEntry> {
  const file = path.join(SERVER_DIR, SERVER_ENTRY_FILE);
  const module = (await import(pathToFileURL(file).href)) as Partial<ServerEntry>;
  if (typeof module.renderRoute !== "function") {
    throw new Error(`[prerender] ${file} does not export renderRoute()`);
  }
  return module as ServerEntry;
}

async function writeRoute(pathname: string, html: string): Promise<string> {
  const file = path.join(PUBLIC_DIR, prerenderOutputFile(pathname));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html, "utf8");
  return file;
}

/**
 * Renders every route to HTML. Returns the number of files written per kind.
 */
export async function prerenderSite(): Promise<PrerenderSummary> {
  // Read the shell once, up front: the "/" route overwrites index.html, so
  // every later route would otherwise be built on top of a prerendered page.
  const shell = await readFile(SHELL_FILE, "utf8");
  if (!shell.includes(HEAD_START) || !shell.includes(BODY_START)) {
    throw new Error(`[prerender] ${SHELL_FILE} is missing the prerender markers`);
  }

  await buildServerEntry();
  const { renderRoute } = await loadServerEntry();

  const summary: PrerenderSummary = { publicRoutes: 0, privateRoutes: 0 };

  for (const route of PUBLIC_ROUTES) {
    const { headHtml, bodyHtml } = renderRoute(route.path);

    let html = markPrerenderKind(shell, "public");
    html = replaceBetween(html, HEAD_START, HEAD_END, stripShellOwnedTags(headHtml), "head");
    html = replaceBetween(html, BODY_START, BODY_END, bodyHtml, "body");

    const file = await writeRoute(route.path, html);
    summary.publicRoutes += 1;
    console.log(`[prerender] ${route.path} -> ${path.relative(ROOT, file)} (${html.length} bytes)`);
  }

  for (const route of PRIVATE_ROUTES) {
    // Only the head is rewritten; the body keeps the shell fallback, which the
    // client throws away before rendering the per-user view.
    let html = markPrerenderKind(shell, "private");
    html = replaceBetween(html, HEAD_START, HEAD_END, markDataRh(seoHeadHtml(route.path)), "head");

    const file = await writeRoute(route.path, html);
    summary.privateRoutes += 1;
    console.log(`[prerender] ${route.path} -> ${path.relative(ROOT, file)} (shell + noindex)`);
  }

  // The SSR bundle is a build-time tool only; keeping it out of the deploy
  // artifact avoids shipping server code that nothing serves.
  await rm(SERVER_DIR, { recursive: true, force: true });

  return summary;
}
