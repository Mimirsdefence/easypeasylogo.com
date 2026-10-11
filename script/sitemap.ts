/**
 * Sitemap writer
 * ---------------------------------------------------------------------------
 * Generated from PUBLIC_ROUTES in shared/seo.ts, so the sitemap can never
 * drift from the routes that are actually prerendered and indexable. Private
 * routes are excluded by construction.
 *
 * The output replaces the hand-written client/public/sitemap.xml: a generated
 * file cannot forget a new page.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { PUBLIC_ROUTES, absoluteUrl } from "../shared/seo";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildSitemapXml(lastmod: string = today()): string {
  const urls = PUBLIC_ROUTES.map((route) =>
    [
      "  <url>",
      `    <loc>${absoluteUrl(route.path)}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <changefreq>${route.changefreq}</changefreq>`,
      `    <priority>${route.priority.toFixed(1)}</priority>`,
      "  </url>",
    ].join("\n"),
  ).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}

/** Writes sitemap.xml into the build output and returns the file path. */
export async function writeSitemap(publicDir: string): Promise<string> {
  const file = path.join(publicDir, "sitemap.xml");
  await writeFile(file, buildSitemapXml(), "utf8");
  return file;
}
