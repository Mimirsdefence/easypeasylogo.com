/**
 * platform-reviewer — deterministic, code-based quality gate for the two
 * generated concepts. Runs between Agent 2 (Prompt Maker) and kie.ai, and again
 * on the finished jobs. No network, no LLM: pure rules, so it is predictable and
 * cheap.
 *
 * It answers three questions:
 *   1. Does each prompt match the platform spec (canvas ratio + safe zone)?
 *   2. Are the two concepts actually DIFFERENT directions (not two flavours of
 *      the same layout)?
 *   3. If the platform needs the text drawn in code, is the generator told to
 *      leave the safe zone empty — and does the text we will draw fit?
 *
 * Every problem is reported as an issue, and where possible the prompt is
 * patched so the pipeline can continue instead of failing.
 */

import {
  layoutText,
  needsCodeOverlay,
  parseRatio,
  resolvePlatformSpec,
  specRatio,
  type PlatformSpec,
} from "../../shared/platforms";

export const REVIEW_MARKER = "[platform-review]";

export interface ReviewInput {
  /** Agent-1 summary (brand/design/asset/output) — used for the overlay text. */
  summary: unknown;
  assetType?: string | null;
  platform?: string | null;
  format?: string | null;
  textUsage?: string | null;
  concepts: ReviewConcept[];
}

export interface ReviewConcept {
  index: number;
  sceneTitle: string;
  finalPrompt: string;
  aspectRatio: string;
  imageInput?: string[];
}

export interface ConceptReview {
  index: number;
  ok: boolean;
  issues: string[];
  patchedPrompt: string;
  aspectRatio: string;
  /** true when the prompt was modified */
  patched: boolean;
  /** composition archetypes detected in the prompt */
  archetypes: string[];
  textDetected: boolean;
}

export interface OverlayPlan {
  needed: boolean;
  /** the text the server will draw */
  text: string;
  headline: string;
  subline: string | null;
  fits: boolean;
  fontSize: number;
  lines: string[];
  specId: string | null;
}

export interface ReviewResult {
  spec: PlatformSpec | null;
  specId: string | null;
  concepts: ConceptReview[];
  /** Jaccard/archetype blend, 0 = totally different, 1 = identical */
  similarity: number;
  divergent: boolean;
  issues: string[];
  overlay: OverlayPlan;
  /**
   * Informational only. `false` means the reviewer had to correct something —
   * the pipeline continues with the patched prompts (a missing canvas ratio or a
   * text-free background are normal corrections, not failures).
   */
  ok: boolean;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  "a", "an", "and", "as", "at", "be", "by", "for", "from", "in", "into", "is", "it", "its", "of", "on", "or", "that",
  "the", "their", "this", "to", "with", "will", "should", "must", "also", "very", "then", "than", "so", "not", "no",
  "use", "using", "used", "keep", "kept", "make", "made", "ensure", "image", "design", "logo", "brand", "background",
  "prompt", "concept", "final", "output", "style", "color", "colour", "palette", "clean", "high", "quality",
]);

function tokenize(text: string): Set<string> {
  const tokens = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Layout / treatment keywords used to tell two directions apart. */
const ARCHETYPES: Array<{ id: string; re: RegExp }> = [
  { id: "centered-symmetric", re: /cent(er|re)d|(?<![a-z])symmetric|dead cent|balanced composition/ },
  { id: "asymmetric-open", re: /asymmetric|off-?cent|off-?centre|rule of thirds|diagonal|dynamic angle|negative space/ },
  { id: "minimal-flat", re: /flat|minimal|geometric|vector|line art|monoline|simple shapes/ },
  { id: "gradient-depth", re: /gradient|3d|three-?dimensional|glossy|bevel|dimensional|soft shadow|depth/ },
  { id: "photographic", re: /photograph|photo |cinematic|realistic|product shot|studio light|scene/ },
  { id: "textured-organic", re: /texture|organic|hand-?drawn|watercolou?r|grain|paper|brush/ },
  { id: "dark-ground", re: /dark (background|backdrop|ground)|black background|night|moody|deep shadow/ },
  { id: "light-ground", re: /light (background|backdrop|ground)|white background|bright|airy|pastel|cream/ },
  { id: "bold-typography", re: /bold typograph|heavy type|big type|display type|typographic|oversized letters/ },
  { id: "emblem-badge", re: /emblem|badge|crest|shield|seal|circular lockup|monogram|stamp/ },
];

function detectArchetypes(text: string): string[] {
  const t = String(text ?? "").toLowerCase();
  return ARCHETYPES.filter((a) => a.re.test(t)).map((a) => a.id);
}

const TEXT_WORDS =
  /\b(text|lettering|letters|wordmark|tagline|typograph\w*|headline|title|words|caption|verbal|font)\b/i;

/** Phrases that mean "this image must stay free of text" — not a text request. */
const NO_TEXT_PHRASES = [
  /\bno (?:text|letters?|words?|lettering|typography|fonts?|watermarks?)\b/gi,
  /\bwithout (?:any )?(?:text|letters?|words?|lettering|typography|fonts?)\b/gi,
  /\b(?:text|typography|letter)[- ]free\b/gi,
  /\bzero text\b/gi,
  /\bavoid (?:any )?(?:text|letters?|words?)\b/gi,
];

/** True when the prompt actually asks the generator to render words. */
function detectsTextIntent(prompt: string): boolean {
  let cleaned = String(prompt ?? "");
  for (const re of NO_TEXT_PHRASES) cleaned = cleaned.replace(re, " ");
  return TEXT_WORDS.test(cleaned);
}

function sanitizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function readPath(source: any, path: string[]): unknown {
  let cursor: any = source;
  for (const key of path) {
    if (cursor === null || cursor === undefined || typeof cursor !== "object") return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

/** Pick headline + subline for the code-drawn text overlay. */
export function buildOverlayText(
  summary: unknown,
  opts?: { headline?: string | null; subline?: string | null },
): { headline: string; subline: string | null } {
  const headline =
    sanitizeText(opts?.headline) ||
    sanitizeText(readPath(summary, ["brand", "name"])) ||
    sanitizeText(readPath(summary, ["brand", "type"])) ||
    "";
  let subline = sanitizeText(opts?.subline) || sanitizeText(readPath(summary, ["meta", "tagline"])) || null;
  if (subline && subline.toUpperCase() === "N/A") subline = null;
  // Never repeat the headline as the subline.
  if (subline && subline.toLowerCase() === headline.toLowerCase()) subline = null;
  return { headline, subline };
}

/* ------------------------------------------------------------------ */
/* prompt patching                                                     */
/* ------------------------------------------------------------------ */

function withMarker(prompt: string, directive: string): string {
  const base = String(prompt ?? "").trim();
  if (base.includes(REVIEW_MARKER)) return base;
  return `${base}\n\n${REVIEW_MARKER} ${directive}`.trim();
}

const DIVERGENCE_DIRECTIVE =
  "CONCEPT DIVERGENCE (mandatory). This is concept 2 and must read as a clearly DIFFERENT creative direction from concept 1 — " +
  "same brand, same palette, same typography, but switch composition archetype, layout geometry and background treatment " +
  "(for example: if concept 1 is a centred emblem on a dark ground, concept 2 must be an asymmetric open composition on a light " +
  "or gradient ground, with a different focal structure and a different camera/viewpoint). Do not reuse the same layout bones.";

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

export function reviewConcepts(input: ReviewInput): ReviewResult {
  const spec =
    resolvePlatformSpec({
      assetType: input.assetType,
      platform: input.platform,
      format: input.format,
    }) ?? null;

  const issues: string[] = [];
  const reviews: ConceptReview[] = [];
  const targetRatio = spec ? spec.generatorRatio : null;
  const ratioValue = spec ? specRatio(spec) : null;

  for (const concept of input.concepts) {
    const conceptIssues: string[] = [];
    let prompt = String(concept.finalPrompt ?? "").trim();
    let ratio = String(concept.aspectRatio ?? "").trim();
    let patched = false;

    const archetypes = detectArchetypes(prompt);
    const textDetected = detectsTextIntent(prompt);

    // 1. ratio / canvas
    if (spec && targetRatio) {
      const supplied = parseRatio(ratio);
      const matches =
        supplied !== null && ratioValue !== null ? Math.abs(supplied - ratioValue) / ratioValue <= 0.06 : false;
      if (!matches) {
        conceptIssues.push(
          `aspect ratio "${ratio || "missing"}" does not match ${spec.label} (${spec.width}x${spec.height}, ${targetRatio}) — forced by code`,
        );
        ratio = targetRatio;
        patched = true;
      }
    } else if (!parseRatio(ratio) && ratio.toLowerCase() !== "auto") {
      conceptIssues.push(`unparsable aspect ratio "${ratio}", generator default applied`);
    }

    // 2. text handling per platform
    if (spec) {
      const overlay = needsCodeOverlay(spec, input.textUsage);
      if (spec.codeOverlay && overlay && textDetected) {
        conceptIssues.push(
          `prompt asks the generator to draw text on ${spec.label}; text is composited in code instead — a background-only directive was appended`,
        );
        prompt = withMarker(prompt, spec.placementNote);
        patched = true;
      } else if (spec.codeOverlay && overlay) {
        prompt = withMarker(prompt, spec.placementNote);
        patched = true;
      } else if (!spec.codeOverlay) {
        const zone = `Keep all text and branding inside the safe area (${spec.safeZone.x},${spec.safeZone.y})–(${
          spec.safeZone.x + spec.safeZone.width
        },${spec.safeZone.y + spec.safeZone.height}) of the ${spec.width}x${spec.height} ${spec.label} frame. ${spec.placementNote}.`;
        if (!prompt.includes(REVIEW_MARKER)) {
          prompt = withMarker(prompt, zone);
          patched = true;
        }
      }
      // Text requested but the user asked for a text-free asset.
      const usage = sanitizeText(input.textUsage).toLowerCase();
      if (usage === "none" && textDetected) {
        conceptIssues.push(`summary says text_usage="none" but the prompt describes text — review before publishing`);
      }
    }

    reviews.push({
      index: concept.index,
      ok: conceptIssues.length === 0,
      issues: conceptIssues,
      patchedPrompt: prompt,
      aspectRatio: ratio,
      patched,
      archetypes,
      textDetected,
    });
  }

  // 3. divergence between the two concepts
  let similarity = 0;
  let divergent = true;
  if (reviews.length >= 2) {
    const [a, b] = reviews;
    const tokenSim = jaccard(tokenize(a.patchedPrompt), tokenize(b.patchedPrompt));
    const sharedArchetypes = a.archetypes.filter((x) => b.archetypes.includes(x));
    const archetypePenalty = sharedArchetypes.length / Math.max(1, Math.min(a.archetypes.length, b.archetypes.length) || 1);
    similarity = Math.round((0.6 * tokenSim + 0.4 * archetypePenalty) * 100) / 100;
    divergent = similarity < 0.7;

    if (!divergent) {
      issues.push(
        `concepts are too similar (similarity ${similarity}) — shared archetypes: ${sharedArchetypes.join(", ") || "none"}; a divergence directive was appended to concept 2`,
      );
      const second = reviews[1];
      second.patchedPrompt = withMarker(second.patchedPrompt, DIVERGENCE_DIRECTIVE);
      second.patched = true;
      second.ok = false;
      second.issues.push(`low divergence from concept 1 (similarity ${similarity})`);
    }
  }

  // 4. overlay plan
  const overlayNeeded = !!spec && needsCodeOverlay(spec, input.textUsage);
  const { headline, subline } = buildOverlayText(input.summary);
  const combined = sanitizeText([headline, subline].filter(Boolean).join(" "));
  const layout = spec ? layoutText(combined || headline, spec) : null;
  const overlay: OverlayPlan = {
    needed: overlayNeeded,
    text: combined || headline,
    headline,
    subline,
    fits: layout ? layout.fits : true,
    fontSize: layout ? layout.fontSize : 0,
    lines: layout ? layout.lines : [],
    specId: spec ? spec.id : null,
  };
  if (overlayNeeded && !overlay.text) {
    issues.push("code overlay is required but no brand name/text was found in the summary");
  }
  if (overlayNeeded && layout && !layout.fits) {
    issues.push(`overlay text does not fit ${spec?.label} safe zone (${layout.truncated ? "truncated" : "too tall"})`);
  }

  const ok = issues.length === 0 && reviews.every((r) => r.ok);

  return {
    spec,
    specId: spec ? spec.id : null,
    concepts: reviews,
    similarity,
    divergent,
    issues,
    overlay,
    ok,
  };
}
