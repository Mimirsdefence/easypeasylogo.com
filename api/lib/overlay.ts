/**
 * overlay — finish a generated image server-side.
 *
 * The generator (Nano Banana 2) is good at artwork but unreliable at two things
 * this product needs:
 *   - exact social canvases (the Facebook Page cover is 820x312 ≈ 2.63:1, which
 *     is not in the model's ratio list)
 *   - text placement inside the platform safe zone
 *
 * So we ask for the closest ratio, then crop to the exact canvas with sharp and
 * draw the brand text ourselves inside the safe zone from `shared/platforms.ts`.
 * The raw generator output is always kept (see `raw_urls`), so this step never
 * destroys the original.
 *
 * Degrades gracefully: if anything in the text step fails, the correctly cropped
 * background is still returned with a note, instead of failing the whole job.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { layoutText, needsCodeOverlay, type PlatformSpec, type SafeZone } from "../../shared/platforms";

/* ------------------------------------------------------------------ */
/* fonts                                                               */
/* ------------------------------------------------------------------ */

const VENDORED_FAMILY = "Inter";
const FALLBACK_FAMILY = "Helvetica, Arial, 'DejaVu Sans', 'Liberation Sans', sans-serif";
const FONT_FILES = ["Inter-Bold.ttf", "Inter-SemiBold.ttf"];

function resolveFontDir(): string | null {
  const candidates: string[] = [];
  if (process.env.OVERLAY_FONT_DIR) candidates.push(process.env.OVERLAY_FONT_DIR);
  candidates.push(path.join(process.cwd(), "api", "assets", "fonts"));
  candidates.push(path.join(process.cwd(), "assets", "fonts"));
  for (const dir of candidates) {
    try {
      if (FONT_FILES.some((f) => existsSync(path.join(dir, f)))) return dir;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

interface FontState {
  family: string;
  dir: string | null;
  error?: string;
}

let fontStatePromise: Promise<FontState> | null = null;

/**
 * Point fontconfig at the fonts vendored in `api/assets/fonts` so text renders
 * identically in serverless environments (where no system fonts exist).
 */
export function ensureFonts(): Promise<FontState> {
  if (fontStatePromise) return fontStatePromise;
  fontStatePromise = (async (): Promise<FontState> => {
    const dir = resolveFontDir();
    if (!dir) return { family: FALLBACK_FAMILY, dir: null, error: "no vendored font found" };
    try {
      const confDir = path.join(tmpdir(), "entropic-fontconfig");
      const cacheDir = path.join(confDir, "cache");
      mkdirSync(cacheDir, { recursive: true });
      const confPath = path.join(confDir, "fonts.conf");
      const xml = [
        '<?xml version="1.0"?>',
        '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">',
        "<fontconfig>",
        `  <dir>${dir}</dir>`,
        `  <cachedir>${cacheDir}</cachedir>`,
        "</fontconfig>",
        "",
      ].join("\n");
      writeFileSync(confPath, xml, "utf8");
      process.env.FONTCONFIG_FILE = confPath;
      process.env.FONTCONFIG_PATH = confDir;
      if (!process.env.XDG_CACHE_HOME) process.env.XDG_CACHE_HOME = cacheDir;
      return { family: VENDORED_FAMILY, dir };
    } catch (error) {
      return {
        family: FALLBACK_FAMILY,
        dir: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })();
  return fontStatePromise;
}

/** Diagnostics for the health endpoint. */
export async function fontStatus(): Promise<{ family: string; dir: string | null; glyphs: boolean; error?: string }> {
  const state = await ensureFonts();
  return { family: state.family, dir: state.dir, glyphs: await canRenderText(state.family), error: state.error };
}

/* ------------------------------------------------------------------ */
/* svg helpers                                                         */
/* ------------------------------------------------------------------ */

function escapeXml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface TextBlock {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  weight: number;
  letterSpacing: number;
  centerX: number;
  /** baseline y for each line */
  baselines: number[];
}

function renderTextBlock(block: TextBlock, family: string, paint: { fill: string; stroke?: string; strokeWidth?: number }): string {
  const attrs = [
    'text-anchor="middle"',
    `font-family="${escapeXml(family)}"`,
    `font-size="${block.fontSize}"`,
    `font-weight="${block.weight}"`,
    `fill="${paint.fill}"`,
    paint.stroke ? `stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}" stroke-linejoin="round"` : "",
    block.letterSpacing ? `letter-spacing="${block.letterSpacing}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const tspans = block.lines
    .map((line, index) => `<tspan x="${block.centerX}" y="${block.baselines[index] ?? block.baselines[0]}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<text ${attrs}>${tspans}</text>`;
}

function clampZone(zone: SafeZone, width: number, height: number): SafeZone {
  const x = Math.max(0, Math.min(zone.x, width - 1));
  const y = Math.max(0, Math.min(zone.y, height - 1));
  return {
    x,
    y,
    width: Math.max(1, Math.min(zone.width, width - x)),
    height: Math.max(1, Math.min(zone.height, height - y)),
  };
}

interface ZoneReadability {
  luminance: number;
  busyness: number;
}

/** Mean luminance + channel spread inside the safe zone, so text stays legible. */
async function readZone(image: Buffer, zone: SafeZone): Promise<ZoneReadability | null> {
  try {
    const region = await sharp(image).extract({ left: zone.x, top: zone.y, width: zone.width, height: zone.height }).toBuffer();
    const stats = await sharp(region).stats();
    const [r, g, b] = stats.channels;
    const luminance = 0.2126 * (r?.mean ?? 0) + 0.7152 * (g?.mean ?? 0) + 0.0722 * (b?.mean ?? 0);
    const busyness = [r, g, b].reduce((max, c) => Math.max(max, c?.stdev ?? 0), 0);
    return { luminance, busyness };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */

let textRenderCheck: Promise<boolean> | null = null;

/**
 * Render a one-word probe and check that real ink appears. On serverless hosts
 * with no system fonts this fails loudly instead of shipping a blank overlay.
 */
function canRenderText(family: string): Promise<boolean> {
  if (textRenderCheck) return textRenderCheck;
  textRenderCheck = (async () => {
    try {
      const probe = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="60"><rect width="140" height="60" fill="#ffffff"/><text x="6" y="44" font-family="${escapeXml(family)}" font-size="40" font-weight="700" fill="#000000">MWmw</text></svg>`,
        "utf8",
      );
      const stats = await sharp(probe).stats();
      const darkest = stats.channels.reduce((min, channel) => Math.min(min, channel.min), 255);
      return darkest < 200;
    } catch {
      return false;
    }
  })();
  return textRenderCheck;
}

export interface ComposeOptions {
  spec: PlatformSpec;
  /** primary text (usually the brand name) */
  headline?: string | null;
  /** optional secondary text */
  subline?: string | null;
  /** Agent-1 `asset.text_usage` — controls whether text is drawn */
  textUsage?: unknown;
  /** force background-only output even if text exists */
  backgroundOnly?: boolean;
  /** draw text even for specs where the generator normally handles it */
  forceOverlay?: boolean;
}

export interface ComposeResult {
  buffer: Buffer;
  format: "jpeg" | "png";
  width: number;
  height: number;
  textDrawn: boolean;
  lines: string[];
  fontSize: number;
  notes: string[];
}

/**
 * Crop/pad the generated artwork to the platform canvas and (when the spec asks
 * for it) draw the brand text inside the safe zone.
 */
export async function composePlatformImage(input: Buffer, options: ComposeOptions): Promise<ComposeResult> {
  const { spec } = options;
  const notes: string[] = [];
  const zone = clampZone(spec.safeZone, spec.width, spec.height);

  // 1. normalise orientation + crop to the exact canvas
  let base = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: spec.width, height: spec.height, fit: "cover", position: "centre", kernel: "lanczos3" })
    .toBuffer();

  // 2. text overlay
  const headline = String(options.headline ?? "").replace(/\s+/g, " ").trim();
  const subline = String(options.subline ?? "").replace(/\s+/g, " ").trim();
  const wantsText =
    !options.backgroundOnly && !!headline && (options.forceOverlay === true || needsCodeOverlay(spec, options.textUsage));

  let textDrawn = false;
  const drawnLines: string[] = [];
  let drawnFontSize = 0;

  if (wantsText) {
    try {
      const font = await ensureFonts();

      const head = layoutText(headline, spec);
      // keep the headline inside the zone instead of filling it edge to edge
      const comfort = 0.85;
      let subFontSize = 0;
      let subLines: string[] = [];
      let subLineHeight = 0;
      if (subline) {
        const subLayout = layoutText(subline, {
          ...spec,
          maxTextChars: Math.max(12, Math.round(spec.maxTextChars * 1.25)),
          safeZone: { ...zone, height: Math.round(zone.height * 0.45) },
        });
        subFontSize = Math.max(11, Math.round(head.fontSize * comfort * 0.42));
        subLines = subLayout.lines;
        subLineHeight = Math.round(subFontSize * 1.3);
      }

      const headLine = head.lineHeight * comfort;
      const gap = subLines.length ? Math.round(head.fontSize * comfort * 0.5) : 0;
      const totalHeight = headLine * head.lines.length + gap + subLineHeight * subLines.length;
      // Wide, short canvases (covers, banners) need a restrained stack — filling the
      // whole frame with type reads as a poster, and leaves no artwork visible.
      const heightBudget = Math.min(zone.height, Math.round(spec.height * (spec.height <= 420 ? 0.45 : 0.8)));
      const scale = totalHeight > heightBudget ? heightBudget / totalHeight : 1;

      const hFont = Math.max(10, Math.round(head.fontSize * comfort * scale));
      const hLine = Math.max(12, Math.round(headLine * scale));
      const sFont = Math.max(10, Math.round(subFontSize * scale));
      const sLine = Math.max(12, Math.round(subLineHeight * scale));
      const blockHeight = hLine * head.lines.length + (subLines.length ? Math.round(gap * scale) + sLine * subLines.length : 0);
      const centerX = Math.round(zone.x + zone.width / 2);

      let cursor = Math.round(zone.y + (zone.height - blockHeight) / 2);
      const bandTop = cursor;
      const headBlock: TextBlock = {
        lines: head.lines,
        fontSize: hFont,
        lineHeight: hLine,
        weight: 700,
        letterSpacing: head.lines.join("").length <= 14 ? Math.round(hFont * 0.01) : 0,
        centerX,
        baselines: head.lines.map((_, i) => Math.round(cursor + hFont * 0.8 + i * hLine)),
      };
      cursor += hLine * head.lines.length + Math.round(gap * scale);
      const subBlock: TextBlock | null = subLines.length
        ? {
            lines: subLines,
            fontSize: sFont,
            lineHeight: sLine,
            weight: 600,
            letterSpacing: Math.round(sFont * 0.04),
            centerX,
            baselines: subLines.map((_, i) => Math.round(cursor + sFont * 0.8 + i * sLine)),
          }
        : null;

      const parts: string[] = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}">`,
      ];

      // Contrast is judged on the area the glyphs actually cover, not the whole
      // safe zone — a split background (dark left / light right) fools a mean.
      const innerZone: SafeZone = {
        x: zone.x,
        y: bandTop,
        width: zone.width,
        height: Math.min(blockHeight, spec.height - bandTop),
      };
      const bandPad = Math.round(blockHeight * 0.22);
      const band = clampZone(
        { x: innerZone.x, y: bandTop - bandPad, width: innerZone.width, height: blockHeight + bandPad * 2 },
        spec.width,
        spec.height,
      );
      const readability = await readZone(base, innerZone);
      const luminance = readability?.luminance ?? 128;
      const busyness = readability?.busyness ?? 0;
      const calm = busyness < 52;

      let textColor: string;
      let plateAlpha = 0;
      if (calm && luminance >= 168) {
        textColor = "#111111";
      } else if (calm && luminance < 118) {
        textColor = "#ffffff";
      } else {
        // mid-tone or busy artwork: white text over a tight dark gradient band
        textColor = "#ffffff";
        plateAlpha = 0.55;
      }

      if (plateAlpha > 0) {
        // Uniform scrim across the whole text block, fading out only in the padding
        // above and below it — a fade running through the text washes out the last line.
        const fade = Math.max(0.02, Math.min(0.45, bandPad / band.height));
        parts.push(
          '<defs><linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">',
          '<stop offset="0" stop-color="#000000" stop-opacity="0"/>',
          `<stop offset="${fade.toFixed(3)}" stop-color="#000000" stop-opacity="${plateAlpha}"/>`,
          `<stop offset="${(1 - fade).toFixed(3)}" stop-color="#000000" stop-opacity="${plateAlpha}"/>`,
          '<stop offset="1" stop-color="#000000" stop-opacity="0"/>',
          "</linearGradient></defs>",
          `<rect x="0" y="${band.y}" width="${spec.width}" height="${band.height}" fill="url(#plate)"/>`,
        );
      }

      const outline = textColor === "#111111" ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
      const blocks = [headBlock, subBlock].filter(Boolean) as TextBlock[];
      for (const block of blocks) {
        // soft outline for legibility on busy backgrounds, then the fill
        parts.push(
          renderTextBlock(block, font.family, {
            fill: "none",
            stroke: outline,
            strokeWidth: Math.max(2, Math.round(block.fontSize * 0.05)),
          }),
        );
        parts.push(renderTextBlock(block, font.family, { fill: textColor }));
      }
      parts.push("</svg>");

      base = await sharp(base)
        .composite([{ input: Buffer.from(parts.join(""), "utf8"), top: 0, left: 0 }])
        .toBuffer();

      textDrawn = true;
      drawnLines.push(...headBlock.lines, ...(subBlock ? subBlock.lines : []));
      drawnFontSize = hFont;

      // self-check: can this runtime actually render glyphs for the chosen family?
      if (!(await canRenderText(font.family))) {
        notes.push("font renderer produced no glyphs — check the vendored font in this runtime");
        textDrawn = false;
      }
      if (!font.dir) notes.push("vendored font not found, used generic font family");
    } catch (error) {
      notes.push(`text overlay failed: ${error instanceof Error ? error.message : String(error)}`);
      textDrawn = false;
    }
  }

  // 3. circular mask for avatar formats
  if (spec.circle) {
    try {
      const r = spec.width / 2;
      const mask = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}"><circle cx="${r}" cy="${r}" r="${r}" fill="#ffffff"/></svg>`,
        "utf8",
      );
      base = await sharp(base).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
    } catch (error) {
      notes.push(`circle mask failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 4. encode (metadata stripped by default)
  const usePng = !!spec.circle;
  let buffer = usePng
    ? await sharp(base).png({ compressionLevel: 9, palette: false }).toBuffer()
    : await sharp(base).jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();

  const check = await sharp(buffer).metadata();
  if (check.width !== spec.width || check.height !== spec.height) {
    notes.push(`unexpected output size ${check.width}x${check.height} (expected ${spec.width}x${spec.height})`);
    buffer = await sharp(base)
      .resize({ width: spec.width, height: spec.height, fit: "cover", position: "centre" })
      .toFormat(usePng ? "png" : "jpeg", usePng ? undefined : { quality: 92 })
      .toBuffer();
  }

  return {
    buffer,
    format: usePng ? "png" : "jpeg",
    width: spec.width,
    height: spec.height,
    textDrawn,
    lines: drawnLines,
    fontSize: drawnFontSize,
    notes,
  };
}
