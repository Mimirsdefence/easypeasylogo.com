/**
 * Platform specs — single source of truth for output canvas, generator aspect
 * ratio and text safe-zones.
 *
 * Why this exists: Nano Banana 2 cannot hit exact social formats (e.g. the
 * Facebook Page cover at 820x312 ≈ 2.63:1 is not in its ratio list). We ask the
 * generator for the closest ratio it supports, then the server crops/pads to the
 * exact canvas. For wide banners the generated text is unreliable, so the server
 * draws the text in code — inside the platform's safe zone — instead.
 *
 * Pure data + pure functions. Imported by the API (relative path) and available
 * to the client. No node/dom dependencies.
 */

export type AssetType = "logo" | "profile_image" | "banner" | "thumbnail" | "post" | "other";

export interface SafeZone {
  /** px offsets inside the final canvas */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlatformSpec {
  id: string;
  label: string;
  /** which asset types this spec can satisfy */
  assetTypes: AssetType[];
  /** final canvas we deliver */
  width: number;
  height: number;
  /** ratio requested from the image generator (must exist in kie.ai's list) */
  generatorRatio: string;
  /** true = generator must NOT draw text; the server overlays it in code */
  codeOverlay: boolean;
  safeZone: SafeZone;
  /** max characters on one line */
  maxTextChars: number;
  maxLines: number;
  textAlign: "center" | "left";
  /** instruction appended to the generator prompt (placement / safe zone) */
  placementNote: string;
  /** rounded corner mask for circle avatar formats */
  circle?: boolean;
}

export const PLATFORM_SPECS: PlatformSpec[] = [
  {
    id: "facebook_cover",
    label: "Facebook Page cover",
    assetTypes: ["banner", "other"],
    width: 820,
    height: 312,
    generatorRatio: "21:9",
    codeOverlay: true,
    safeZone: { x: 90, y: 16, width: 640, height: 280 },
    maxTextChars: 28,
    maxLines: 2,
    textAlign: "center",
    placementNote:
      "background artwork only — absolutely no text, no letters, no watermarks; keep the central 640x280 area clean and uncluttered so text can be added afterwards",
  },
  {
    id: "facebook_post",
    label: "Facebook post",
    assetTypes: ["post", "thumbnail"],
    width: 1200,
    height: 630,
    generatorRatio: "16:9",
    codeOverlay: false,
    safeZone: { x: 60, y: 60, width: 1080, height: 510 },
    maxTextChars: 32,
    maxLines: 3,
    textAlign: "center",
    placementNote: "all text and branding tucked well inside the frame, clear of the outer 60px margins",
  },
  {
    id: "facebook_profile",
    label: "Facebook profile picture",
    assetTypes: ["profile_image"],
    width: 320,
    height: 320,
    generatorRatio: "1:1",
    codeOverlay: false,
    safeZone: { x: 60, y: 60, width: 200, height: 200 },
    maxTextChars: 3,
    maxLines: 1,
    textAlign: "center",
    circle: true,
    placementNote: "single bold mark dead centre, nothing within 60px of any edge (circular crop)",
  },
  {
    id: "instagram_post",
    label: "Instagram post",
    assetTypes: ["post", "thumbnail"],
    width: 1080,
    height: 1080,
    generatorRatio: "1:1",
    codeOverlay: false,
    safeZone: { x: 80, y: 80, width: 920, height: 920 },
    maxTextChars: 30,
    maxLines: 3,
    textAlign: "center",
    placementNote: "text and logo centred with generous margins, clear of the outer 80px",
  },
  {
    id: "instagram_story",
    label: "Instagram story / reel cover",
    assetTypes: ["post", "banner"],
    width: 1080,
    height: 1920,
    generatorRatio: "9:16",
    codeOverlay: false,
    safeZone: { x: 90, y: 250, width: 900, height: 1330 },
    maxTextChars: 26,
    maxLines: 3,
    textAlign: "center",
    placementNote: "keep all text between the top 250px and bottom 340px UI zones, centred in the middle band",
  },
  {
    id: "instagram_profile",
    label: "Instagram profile picture",
    assetTypes: ["profile_image"],
    width: 320,
    height: 320,
    generatorRatio: "1:1",
    codeOverlay: false,
    safeZone: { x: 60, y: 60, width: 200, height: 200 },
    maxTextChars: 3,
    maxLines: 1,
    textAlign: "center",
    circle: true,
    placementNote: "single bold mark dead centre, nothing within 60px of any edge (circular crop)",
  },
  {
    id: "twitter_header",
    label: "X / Twitter header",
    assetTypes: ["banner"],
    width: 1500,
    height: 500,
    generatorRatio: "21:9",
    codeOverlay: true,
    safeZone: { x: 250, y: 70, width: 1000, height: 360 },
    maxTextChars: 30,
    maxLines: 2,
    textAlign: "center",
    placementNote:
      "background artwork only — no text, no letters, no watermark; keep the central 1000x360 band clean (avatar overlaps the lower-left)",
  },
  {
    id: "twitter_post",
    label: "X / Twitter post",
    assetTypes: ["post", "thumbnail"],
    width: 1200,
    height: 675,
    generatorRatio: "16:9",
    codeOverlay: false,
    safeZone: { x: 60, y: 60, width: 1080, height: 555 },
    maxTextChars: 30,
    maxLines: 3,
    textAlign: "center",
    placementNote: "text centred and clear of the outer 60px margins",
  },
  {
    id: "twitter_profile",
    label: "X / Twitter profile picture",
    assetTypes: ["profile_image"],
    width: 400,
    height: 400,
    generatorRatio: "1:1",
    codeOverlay: false,
    safeZone: { x: 75, y: 75, width: 250, height: 250 },
    maxTextChars: 3,
    maxLines: 1,
    textAlign: "center",
    circle: true,
    placementNote: "single bold mark dead centre, nothing within 75px of any edge (circular crop)",
  },
  {
    id: "linkedin_banner",
    label: "LinkedIn banner",
    assetTypes: ["banner"],
    width: 1584,
    height: 396,
    generatorRatio: "4:1",
    codeOverlay: true,
    safeZone: { x: 242, y: 48, width: 1100, height: 300 },
    maxTextChars: 30,
    maxLines: 2,
    textAlign: "center",
    placementNote:
      "background artwork only — no text, no letters, no watermark; keep the central 1100x300 band clean (avatar overlaps the lower-left)",
  },
  {
    id: "linkedin_post",
    label: "LinkedIn post",
    assetTypes: ["post", "thumbnail"],
    width: 1200,
    height: 627,
    generatorRatio: "16:9",
    codeOverlay: false,
    safeZone: { x: 60, y: 60, width: 1080, height: 507 },
    maxTextChars: 32,
    maxLines: 3,
    textAlign: "center",
    placementNote: "text centred and clear of the outer 60px margins",
  },
  {
    id: "youtube_thumbnail",
    label: "YouTube thumbnail",
    assetTypes: ["thumbnail"],
    width: 1280,
    height: 720,
    generatorRatio: "16:9",
    codeOverlay: false,
    safeZone: { x: 60, y: 40, width: 1160, height: 600 },
    maxTextChars: 22,
    maxLines: 2,
    textAlign: "center",
    placementNote:
      "high-impact bold thumbnail, one dominant subject, very short punchy text kept clear of the bottom-right duration badge",
  },
  {
    id: "youtube_banner",
    label: "YouTube channel banner",
    assetTypes: ["banner"],
    width: 2560,
    height: 1440,
    generatorRatio: "16:9",
    codeOverlay: true,
    safeZone: { x: 507, y: 508, width: 1546, height: 423 },
    maxTextChars: 30,
    maxLines: 2,
    textAlign: "center",
    placementNote:
      "background artwork only — no text, no letters, no watermark; all branding must be empty in the central 1546x423 safe area, edges are cropped on mobile",
  },
  {
    id: "youtube_profile",
    label: "YouTube profile picture",
    assetTypes: ["profile_image"],
    width: 800,
    height: 800,
    generatorRatio: "1:1",
    codeOverlay: false,
    safeZone: { x: 150, y: 150, width: 500, height: 500 },
    maxTextChars: 3,
    maxLines: 1,
    textAlign: "center",
    circle: true,
    placementNote: "single bold mark dead centre, nothing within 150px of any edge (circular crop)",
  },
  {
    id: "tiktok_profile",
    label: "TikTok profile picture",
    assetTypes: ["profile_image"],
    width: 320,
    height: 320,
    generatorRatio: "1:1",
    codeOverlay: false,
    safeZone: { x: 60, y: 60, width: 200, height: 200 },
    maxTextChars: 3,
    maxLines: 1,
    textAlign: "center",
    circle: true,
    placementNote: "single bold mark dead centre, nothing within 60px of any edge (circular crop)",
  },
  {
    id: "website_hero",
    label: "Website hero / banner",
    assetTypes: ["banner"],
    width: 1920,
    height: 1080,
    generatorRatio: "16:9",
    codeOverlay: false,
    safeZone: { x: 120, y: 120, width: 1680, height: 840 },
    maxTextChars: 40,
    maxLines: 3,
    textAlign: "center",
    placementNote: "wide web header, key content centred and clear of the outer 120px",
  },
  {
    id: "logo",
    label: "Logo / brand mark",
    assetTypes: ["logo"],
    width: 1024,
    height: 1024,
    generatorRatio: "1:1",
    codeOverlay: false,
    safeZone: { x: 120, y: 180, width: 784, height: 664 },
    maxTextChars: 16,
    maxLines: 2,
    textAlign: "center",
    placementNote: "clean, scalable lockup with balanced spacing, suitable for both small and large use",
  },
  {
    id: "generic_profile",
    label: "Profile picture",
    assetTypes: ["profile_image"],
    width: 400,
    height: 400,
    generatorRatio: "1:1",
    codeOverlay: false,
    safeZone: { x: 75, y: 75, width: 250, height: 250 },
    maxTextChars: 3,
    maxLines: 1,
    textAlign: "center",
    circle: true,
    placementNote: "single bold mark dead centre, nothing within 75px of any edge (circular crop)",
  },
];

export function findSpecById(id: string): PlatformSpec | null {
  return PLATFORM_SPECS.find((s) => s.id === id) ?? null;
}

export function parseRatio(ratio: string): number | null {
  const m = String(ratio ?? "").match(/^\s*(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)\s*$/i);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return null;
  return w / h;
}

export function specRatio(spec: PlatformSpec): number {
  return spec.width / spec.height;
}

const norm = (value: unknown): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Map the Agent-1 summary (asset.type / asset.platform / asset.format) onto a
 * concrete platform spec. Returns null when nothing matches (generator decides).
 */
export function resolvePlatformSpec(input: {
  assetType?: string | null;
  platform?: string | null;
  format?: string | null;
}): PlatformSpec | null {
  const type = norm(input.assetType);
  const p = norm(input.platform);

  const isProfile = /profile|avatar|icon/.test(type) || /profile|avatar|icon/.test(p);
  const isBanner =
    /banner|cover|header|hero|channel art|omslag/.test(type) || /banner|cover|header|hero|channel art|omslag/.test(p);
  const isThumb = /thumbnail/.test(type);
  const isPost = /post/.test(type) || /post/.test(p);
  const isLogo = /logo|logotype|brand mark|wordmark/.test(type) || /logo|brand mark|wordmark/.test(p);

  const fb = /facebook|\bfb\b|\bmeta\b/.test(p);
  const ig = /instagram|insta|\big\b/.test(p);
  const x = /twitter|\bx\b|tweet/.test(p);
  const li = /linkedin/.test(p);
  const yt = /youtube|\byt\b/.test(p);
  const tt = /tiktok|tik tok/.test(p);

  const byId = (id: string) => findSpecById(id);

  if (!type && !p) return null;

  if (isLogo) return byId("logo");
  if (yt && isThumb) return byId("youtube_thumbnail");
  if (yt && isBanner) return byId("youtube_banner");
  if (yt && isProfile) return byId("youtube_profile");
  if (fb && isProfile) return byId("facebook_profile");
  if (fb && isBanner) return byId("facebook_cover");
  if (fb && (isPost || isThumb)) return byId("facebook_post");
  if (ig && isProfile) return byId("instagram_profile");
  if (ig && /story|reel/.test(type) === false && isBanner) return byId("instagram_story");
  if (ig && /story|reel/.test(type)) return byId("instagram_story");
  if (ig && (isPost || isThumb)) return byId("instagram_post");
  if (x && isBanner) return byId("twitter_header");
  if (x && isProfile) return byId("twitter_profile");
  if (x && (isPost || isThumb)) return byId("twitter_post");
  if (li && isBanner) return byId("linkedin_banner");
  if (li && isProfile) return byId("generic_profile");
  if (li && (isPost || isThumb)) return byId("linkedin_post");
  if (tt && isProfile) return byId("tiktok_profile");
  if (/website|web|site/.test(p) && (isBanner || /hero/.test(type))) return byId("website_hero");
  if (isProfile) return byId("generic_profile");
  if (isBanner) return byId("website_hero");
  if (isThumb) return byId("youtube_thumbnail");
  if (isPost) return byId("instagram_post");
  return null;
}

/* ------------------------------------------------------------------ */
/* Text layout inside a safe zone                                      */
/* ------------------------------------------------------------------ */

export interface TextLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  fits: boolean;
  /** true when the text was cut short by maxLines / maxTextChars */
  truncated: boolean;
}

/**
 * Wrap `text` so that it fits inside `spec.safeZone`, and compute a font size
 * that respects both the zone width and height. Deterministic — no measuring.
 */
export function layoutText(text: string, spec: PlatformSpec): TextLayout {
  const clean = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const maxLines = spec.maxTextChars <= 3 ? 1 : Math.max(1, spec.maxLines);
  const words = clean ? clean.split(" ") : [];

  const lines: string[] = [];
  let truncated = false;

  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last === undefined) {
      lines.push(word.slice(0, spec.maxTextChars));
    } else if (`${last} ${word}`.length <= spec.maxTextChars) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else if (lines.length < maxLines) {
      lines.push(word.slice(0, spec.maxTextChars));
    } else {
      truncated = true;
      break;
    }
  }

  const longest = lines.reduce((max, line) => Math.max(max, line.length), 1);
  const byHeight = Math.floor(spec.safeZone.height / (Math.max(1, lines.length) * 1.35));
  const byWidth = Math.floor(spec.safeZone.width / (longest * 0.64));
  const fontSize = Math.max(10, Math.min(byHeight, byWidth, 220));
  const lineHeight = Math.round(fontSize * 1.25);
  const totalHeight = lineHeight * lines.length;
  const fits = !truncated && totalHeight <= spec.safeZone.height;

  return { lines, fontSize, lineHeight, fits, truncated };
}

/** True when the server (not the generator) must draw the text. */
export function needsCodeOverlay(spec: PlatformSpec, textUsage: unknown): boolean {
  const usage = norm(textUsage);
  return spec.codeOverlay && usage !== "none" && usage !== "";
}
