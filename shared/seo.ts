/**
 * SEO — SINGLE SOURCE OF TRUTH
 * ------------------------------------------------------------------
 * Everything that describes this site to crawlers, AI answer engines
 * and social platforms lives here: brand tagline, per-route titles and
 * descriptions, canonical URLs, Open Graph data and JSON-LD schema.
 *
 * Consumers:
 *   - `client/index.html`      the static shell (baseline head)
 *   - `client/src/components/Seo.tsx`  per-page <Helmet> tags
 *   - `script/prerender.ts`    writes one static HTML file per public route
 *   - `script/sitemap.ts`      generates sitemap.xml
 *
 * Never hard-code a title or description anywhere else.
 */

import { STRIPE_PRICES, GENERATION_CREDIT_COST } from "./pricing";

export const SITE_URL = "https://easypeasylogo.com";
export const SITE_NAME = "EasyPeasyLogo";
export const SITE_LOCALE = "en_US";
export const SITE_LANG = "en";

/** Brand tagline. Replaces the retired "Human-Quality AI ..." phrasing. */
export const TAGLINE = "The brand designer that asks before it draws";

/** Short, plain-language description of what the product is. */
export const PRODUCT_SUMMARY =
  "EasyPeasyLogo is a chat-first AI brand designer. It asks about your brand before it draws, then delivers logo, banner and thumbnail concepts in the exact sizes each platform needs.";

export const OG_IMAGE_PATH = "/og-image.png";
export const OG_IMAGE_URL = `${SITE_URL}${OG_IMAGE_PATH}`;
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const LOGO_URL = `${SITE_URL}/favicon.png`;

/** External profiles used as entity signals. Only real, owned profiles. */
export const SOCIAL_PROFILES = ["https://youtube.com/@easypeasylogo"];

export const SUPPORT_EMAIL = "support@easypeasylogo.com";

export type ChangeFreq = "daily" | "weekly" | "monthly" | "yearly";

export interface RouteSeo {
  /** Canonical path, always starting with "/" and never ending with "/" (except root). */
  path: string;
  /** Full <title>, no template suffix needed. */
  title: string;
  /** Meta description, 120-160 characters. */
  description: string;
  /** One-line summary used by AI answer surfaces and the FAQ/intro copy. */
  summary: string;
  /** Search engines: index or keep out of the index. */
  index: boolean;
  changefreq: ChangeFreq;
  priority: number;
}

/**
 * Public, indexable routes. These are the pages that are rendered to
 * static HTML at build time so crawlers see the content without running JS.
 */
export const PUBLIC_ROUTES: RouteSeo[] = [
  {
    path: "/",
    title: `${SITE_NAME} — ${TAGLINE}`,
    description:
      "Chat with an AI brand designer that asks first, then creates logo, banner and thumbnail concepts sized for YouTube, Facebook, LinkedIn and your own site.",
    summary: `EasyPeasyLogo is an AI brand identity designer: ${TAGLINE.toLowerCase()}. Describe your brand in a short chat and receive structured design concepts in platform-correct sizes.`,
    index: true,
    changefreq: "weekly",
    priority: 1,
  },
  {
    path: "/faq",
    title: `FAQ — how ${SITE_NAME} designs your brand identity`,
    description:
      "Answers about how EasyPeasyLogo works: the design chat, concept delivery, credits and revisions, file formats, platform sizes and commercial use.",
    summary:
      "EasyPeasyLogo works in two steps: a guided design chat that collects direction, then concept generation that returns platform-correct visuals.",
    index: true,
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/gallery",
    title: `Gallery — AI logo, banner and thumbnail concepts`,
    description:
      "Concept visuals created with EasyPeasyLogo: logos, YouTube thumbnails, Facebook covers and LinkedIn banners, each composed in the exact size the platform needs.",
    summary:
      "The gallery shows finished EasyPeasyLogo concepts, including logos, thumbnails, Facebook covers and LinkedIn banners in their platform-correct sizes.",
    index: true,
    changefreq: "weekly",
    priority: 0.7,
  },
  {
    path: "/legal",
    title: `Terms, privacy and refunds — ${SITE_NAME}`,
    description:
      "EasyPeasyLogo legal information: Terms of Service, Privacy Policy and Refund Policy for AI-assisted brand identity design and credit purchases.",
    summary:
      "Terms of Service, Privacy Policy and Refund Policy for EasyPeasyLogo cover AI-assisted design output, credits, subscriptions and refunds.",
    index: true,
    changefreq: "yearly",
    priority: 0.4,
  },
  {
    path: "/legal-info",
    title: `Company information — ${SITE_NAME}`,
    description:
      "Company and contact details for EasyPeasyLogo: who operates the service, how to reach support, and where to send questions about orders and refunds.",
    summary:
      "EasyPeasyLogo is operated by Entropic Defence AB. Support is reachable by email for orders, invoices and refund questions.",
    index: true,
    changefreq: "yearly",
    priority: 0.3,
  },
];

/**
 * App routes that must never be indexed: they are per-user, empty
 * without JavaScript, and would be duplicate/thin content.
 */
export const PRIVATE_ROUTES: RouteSeo[] = [
  {
    path: "/app",
    title: `Design studio — ${SITE_NAME}`,
    description: "Your private EasyPeasyLogo design chat and concept workspace.",
    summary: "Private workspace.",
    index: false,
    changefreq: "yearly",
    priority: 0,
  },
  {
    path: "/auth",
    title: `Sign in — ${SITE_NAME}`,
    description: "Sign in to your EasyPeasyLogo account or create a new one.",
    summary: "Sign-in page.",
    index: false,
    changefreq: "yearly",
    priority: 0,
  },
  {
    path: "/auth-return",
    title: `Signing in — ${SITE_NAME}`,
    description: "Completing your EasyPeasyLogo sign-in.",
    summary: "Sign-in callback.",
    index: false,
    changefreq: "yearly",
    priority: 0,
  },
  {
    path: "/profile",
    title: `Your account — ${SITE_NAME}`,
    description: "Your EasyPeasyLogo account, credits and plan.",
    summary: "Private account page.",
    index: false,
    changefreq: "yearly",
    priority: 0,
  },
  {
    path: "/checkout",
    title: `Checkout — ${SITE_NAME}`,
    description: "Complete your EasyPeasyLogo credit purchase.",
    summary: "Checkout page.",
    index: false,
    changefreq: "yearly",
    priority: 0,
  },
  {
    path: "/success",
    title: `Order complete — ${SITE_NAME}`,
    description: "Your EasyPeasyLogo order is complete and your credits are ready.",
    summary: "Order confirmation.",
    index: false,
    changefreq: "yearly",
    priority: 0,
  },
];

const ALL_ROUTES = [...PUBLIC_ROUTES, ...PRIVATE_ROUTES];
const DEFAULT_ROUTE: RouteSeo = PUBLIC_ROUTES[0];

/** "/faq/" | "/faq?x=1" | "faq" -> "/faq"; "/" -> "/" */
export function normalizePath(input: string): string {
  const withoutQuery = (input || "/").split("?")[0].split("#")[0];
  const withSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  const trimmed = withSlash.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function seoForPath(input: string): RouteSeo {
  const path = normalizePath(input);
  return ALL_ROUTES.find((r) => r.path === path) ?? DEFAULT_ROUTE;
}

export function isIndexable(input: string): boolean {
  return seoForPath(input).index;
}

/** Absolute, canonical URL for a route path. */
export function absoluteUrl(input: string): string {
  const path = normalizePath(input);
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

/** Paths that get a prerendered static HTML file. */
export const PRERENDER_PATHS: string[] = PUBLIC_ROUTES.map((r) => r.path);

/** Output file for a prerendered route, relative to the build output dir. */
export function prerenderOutputFile(input: string): string {
  const path = normalizePath(input);
  return path === "/" ? "index.html" : `${path.slice(1)}/index.html`;
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

export type JsonLd = Record<string, unknown>;

export function organizationSchema(): JsonLd {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    alternateName: "Easy Peasy Logo",
    url: SITE_URL,
    logo: LOGO_URL,
    image: OG_IMAGE_URL,
    description: PRODUCT_SUMMARY,
    email: SUPPORT_EMAIL,
    sameAs: SOCIAL_PROFILES,
    founder: { "@type": "Organization", name: "Entropic Defence AB" },
  };
}

export function webSiteSchema(): JsonLd {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: `${SITE_URL}/`,
    name: SITE_NAME,
    description: PRODUCT_SUMMARY,
    inLanguage: SITE_LANG,
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

function usdToNumber(value: string): number {
  return Number(value.replace(/[^0-9.]/g, ""));
}

export function softwareApplicationSchema(): JsonLd {
  const oneTime = STRIPE_PRICES.filter((p) => p.mode === "payment");
  const subscription = STRIPE_PRICES.filter((p) => p.mode === "subscription");
  const prices = [...oneTime, ...subscription].map((p) => usdToNumber(p.usd));

  return {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#app`,
    name: SITE_NAME,
    applicationCategory: "DesignApplication",
    applicationSubCategory: "Brand identity design",
    operatingSystem: "Web browser",
    url: `${SITE_URL}/`,
    description: PRODUCT_SUMMARY,
    featureList: [
      "Guided design chat that collects brand direction before generating",
      "Two distinct concept directions per generation round",
      "Platform-correct sizes for logos, YouTube thumbnails, Facebook covers and LinkedIn banners",
      "Code-applied text placement so headlines stay inside each platform's safe area",
      "Revisions: one revision costs 10 credits",
    ],
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: STRIPE_PRICES.length,
      offers: STRIPE_PRICES.map((p) => ({
        "@type": "Offer",
        name: p.name,
        price: usdToNumber(p.usd),
        priceCurrency: "USD",
        category: p.mode === "subscription" ? "subscription" : "one-time purchase",
        url: `${SITE_URL}/checkout`,
      })),
    },
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function faqPageSchema(items: FaqItem[], path = "/faq"): JsonLd {
  return {
    "@type": "FAQPage",
    "@id": `${absoluteUrl(path)}#faq`,
    url: absoluteUrl(path),
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function breadcrumbSchema(trail: { name: string; path: string }[]): JsonLd {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** How many generations (2 concepts each) the cheapest pack buys. */
export function cheapestPackGenerations(): number {
  const cheapest = STRIPE_PRICES.filter((p) => p.mode === "payment").sort(
    (a, b) => usdToNumber(a.usd) - usdToNumber(b.usd),
  )[0];
  return Math.floor(cheapest.credits / GENERATION_CREDIT_COST);
}

export function buildJsonLd(route: RouteSeo, extras: JsonLd[] = []): JsonLd {
  return {
    "@context": "https://schema.org",
    "@graph": [organizationSchema(), webSiteSchema(), softwareApplicationSchema(), ...extras],
  };
}

/** Safe to inline inside <script type="application/ld+json">. */
export function jsonLdScript(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * A single head tag, described once and rendered either to an HTML string
 * (build time) or to JSX (client-side <Helmet>). One definition, two outputs.
 */
export interface SeoTag {
  tag: "title" | "meta" | "link" | "script";
  attrs?: Record<string, string>;
  /** Raw text content for <title> and <script>. */
  content?: string;
}

export function seoTagList(input: string, extras: JsonLd[] = []): SeoTag[] {
  const route = seoForPath(input);
  const url = absoluteUrl(route.path);
  const robots = route.index
    ? "index, follow, max-image-preview:large, max-snippet:-1"
    : "noindex, follow";

  return [
    { tag: "title", content: route.title },
    { tag: "meta", attrs: { name: "description", content: route.description } },
    { tag: "meta", attrs: { name: "robots", content: robots } },
    { tag: "link", attrs: { rel: "canonical", href: url } },
    { tag: "meta", attrs: { property: "og:site_name", content: SITE_NAME } },
    { tag: "meta", attrs: { property: "og:locale", content: SITE_LOCALE } },
    { tag: "meta", attrs: { property: "og:type", content: "website" } },
    { tag: "meta", attrs: { property: "og:url", content: url } },
    { tag: "meta", attrs: { property: "og:title", content: route.title } },
    { tag: "meta", attrs: { property: "og:description", content: route.description } },
    { tag: "meta", attrs: { property: "og:image", content: OG_IMAGE_URL } },
    { tag: "meta", attrs: { property: "og:image:width", content: String(OG_IMAGE_SIZE.width) } },
    { tag: "meta", attrs: { property: "og:image:height", content: String(OG_IMAGE_SIZE.height) } },
    { tag: "meta", attrs: { property: "og:image:alt", content: `${SITE_NAME} — ${TAGLINE}` } },
    { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
    { tag: "meta", attrs: { name: "twitter:title", content: route.title } },
    { tag: "meta", attrs: { name: "twitter:description", content: route.description } },
    { tag: "meta", attrs: { name: "twitter:image", content: OG_IMAGE_URL } },
    {
      tag: "script",
      attrs: { type: "application/ld+json" },
      content: jsonLdScript(buildJsonLd(route, extras)),
    },
  ];
}

export function seoTagHtml(tag: SeoTag): string {
  const attrs = Object.entries(tag.attrs ?? {})
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join("");

  switch (tag.tag) {
    case "title":
      return `<title>${escapeAttr(tag.content ?? "")}</title>`;
    case "script":
      return `<script${attrs}>${tag.content ?? ""}</script>`;
    case "link":
      return `<link${attrs} />`;
    default:
      return `<meta${attrs} />`;
  }
}

/**
 * The complete crawler-facing head block for a route: title, description,
 * canonical, robots, Open Graph, Twitter card and JSON-LD.
 * Used to build index.html and every prerendered page.
 */
export function seoHeadHtml(input: string, extras: JsonLd[] = []): string {
  return seoTagList(input, extras)
    .map((t) => `    ${seoTagHtml(t)}`)
    .join("\n");
}
