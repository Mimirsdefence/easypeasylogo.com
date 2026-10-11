/**
 * Production build
 * ---------------------------------------------------------------------------
 *   1. client build      -> dist/public (hashed JS/CSS, index.html shell)
 *   2. static files      -> dist/public (favicon, robots.txt, …)
 *   3. prerender         -> dist/public/<route>/index.html for every public
 *                           route, shell + noindex for the private ones
 *   4. sitemap.xml       -> dist/public/sitemap.xml, generated from the route
 *                           table in shared/seo.ts
 *
 * Everything the deploy needs ends up in dist/public; the SSR bundle used to
 * prerender is built and removed again inside script/prerender.ts.
 */

import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { build as viteBuild } from "vite";
import { prerenderSite } from "./prerender";
import { writeSitemap } from "./sitemap";

const PUBLIC_DIR = path.resolve(process.cwd(), "dist/public");

async function buildAll(): Promise<void> {
  await rm(path.resolve(process.cwd(), "dist"), { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("copying static files...");
  await cp("client/public", PUBLIC_DIR, { recursive: true, force: true });

  const { publicRoutes, privateRoutes } = await prerenderSite();
  console.log(`[prerender] ${publicRoutes} public + ${privateRoutes} private pages written`);

  console.log("writing sitemap...");
  const sitemap = await writeSitemap(PUBLIC_DIR);
  console.log(`[sitemap] ${path.relative(process.cwd(), sitemap)}`);

  console.log("build complete.");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
