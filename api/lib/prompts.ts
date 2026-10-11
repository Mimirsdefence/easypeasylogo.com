/**
 * Prompt builders + fail-safe helpers for the two xAI Grok agents.
 * System prompts are the exact n8n originals in ./prompts.data.ts.
 */
import { AGENT1_SYSTEM_PROMPT, AGENT2_SYSTEM_PROMPT } from "./prompts.data";

export { AGENT1_SYSTEM_PROMPT, AGENT2_SYSTEM_PROMPT };

export interface BrandSummary {
  brand?: { name?: string; type?: string; audience?: string; vibe?: string; personality?: string };
  design?: { style?: string; colors?: string; typography?: string; key_elements?: string; complexity?: string };
  asset?: { type?: string; platform?: string; usage_context?: string; format?: string; text_usage?: string };
  output?: { quality?: string };
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Agent 1 user message — same shape as the n8n template:
 * abuse score, existing summary, the user's message and attached-image intent.
 */
export function buildAgent1UserMessage(args: {
  abuseCount: number;
  summary: Record<string, unknown> | null;
  message: string;
  imageUsage?: string | null;
  attachedImage?: string | null;
}): string {
  const imageUsage = args.imageUsage || "null";
  const attachedImage = args.attachedImage || "null";
  const summaryJson = args.summary && Object.keys(args.summary).length
    ? JSON.stringify(args.summary, null, 2)
    : "{}";

  return `Current abuse score: ${args.abuseCount}

Existing summary:
${summaryJson}


- Match the user's language perfectly from User message, - Do NOT default to English if the user writes in another language.

- If the user switches languages, you switch with them immediately.

- All responses, questions, summaries, and confirmations must be in the user's active language.

User message:
${args.message}

Attached image intent:
- imageUsage: ${imageUsage}
- attachedImage: ${attachedImage}

Instructions:
- Use the summary as context and update it. If empty, treat this as the first interaction.`;
}

/**
 * Agent 2 user message — same shape as the n8n "--- DATA INPUT ---" template.
 */
export function buildAgent2UserMessage(args: {
  summary: BrandSummary | null;
  designBrief1?: string | null;
  designBrief2?: string | null;
  imageUsage?: string | null;
  attachedImage?: string | null;
  referenceMode?: string | null;
}): string {
  const s = args.summary || {};
  const val = (...xs: Array<string | undefined | null>) => {
    for (const x of xs) if (x && x !== "N/A") return x;
    return "N/A";
  };

  return `--- DATA INPUT ---
Brand Name: ${val(s.brand?.name)}
Brand Type: ${val(s.brand?.type)}
Target Audience: ${val(s.brand?.audience)}
Vibe/Personality: ${val(s.brand?.vibe)} / ${val(s.brand?.personality)}
Style: ${val(s.design?.style)}
Color Palette: ${val(s.design?.colors)}
Typography Rules: ${val(s.design?.typography)}
Key Elements: ${val(s.design?.key_elements)}
Complexity: ${val(s.design?.complexity)}
Asset Type: ${val(s.asset?.type)}
Platform Target: ${val(s.asset?.platform)}
Target Aspect Ratio: ${val(s.asset?.format)}
Text Usage Setting: ${val(s.asset?.text_usage)}
Requested Quality: ${val(s.output?.quality, "2k")}
Primary Concept Brief: ${val(args.designBrief1)}
Alternative Concept Brief: ${val(args.designBrief2)}
Image Intent Flag: ${val(args.imageUsage, "none")}
Reference Image URL: ${val(args.attachedImage, "")}
Reference Mode: ${val(args.referenceMode, "N/A")}

--- COMMAND ---
Generate the prompt_payloads JSON block using the data input provided above according to your system formatting and prompt engineering rules.`;
}

/* ------------------------------------------------------------------ */
/* Fail-safe refusal detection — ported 1:1 from the n8n code node     */
/* ------------------------------------------------------------------ */

const SENTENCE_PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: "bare_cant_help", re: /^\s*(?:i\s+)?can(?:'t| ?not)\s+(?:help|assist)(?!\s+but|\s+myself)\s*[.!?]?\s*$/i },
  { id: "cant_help_with_that", re: /^\s*i\s+can(?:'t| ?not)\s+(?:help|assist)\s+(?:with\s+(?:that|this|your)\s+request|with\s+that)\b.*$/i },
  { id: "sorry_cant_assist", re: /^(?:i'?m\s+)?sorry[.,\s]*i\s+(?:can(?:'t)?|cannot)\s+(?:assist|help|comply|provide|do)\b.*$/i },
  { id: "cannot_help_request", re: /^i\s+(?:can(?:'t)?|cannot)\s+(?:help|assist|comply|provide)\s+(?:with\s+)?(?:that|this)\s+request\b.*$/i },
  { id: "unable_to_comply", re: /^(?:i'?m\s+)?unable\s+to\s+(?:comply|help|assist|provide|do)\b.*$/i },
  { id: "wont_be_able", re: /^i\s+won(?:'|’)?t\s+be\s+able\s+to\b.*$/i },
  { id: "lack_of_capability", re: /^i\s+do\s+not\s+have\s+(?:the\s+ability|the\s+capability|access)\s+to\b.*$/i },
  { id: "as_an_ai_cannot", re: /^as\s+an\s+ai\b.*\b(?:cannot|can(?:'t)?|do\s+not|won(?:'|’)?t)\b.*$/i },
  { id: "cannot_provide_that", re: /^i\s+(?:can(?:'t)?|cannot)\s+provide\s+(?:that|this|the\s+information|the\s+details)\b.*$/i },
  { id: "cannot_browse_or_access", re: /^i\s+(?:can(?:'t)?|cannot)\s+(?:browse|access)\s+(?:the\s+)?(?:web|internet|external\s+sites)\b.*$/i },
  { id: "just_an_ai_model", re: /^(?:i'?m\s+)?just\s+an\s+(?:ai|language)\s+model\b.*$/i },
];

function splitSentences(text: string): string[] {
  const t = String(text || "").replace(/\u2019/g, "'");
  const parts = t.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return parts.map((s) => s.trim());
}

export function detectRefusal(text: string): boolean {
  const sentences = splitSentences(text.toLowerCase());
  return sentences.some((s) => SENTENCE_PATTERNS.some((p) => p.re.test(s)));
}

/* ------------------------------------------------------------------ */
/* JSON extraction (more forgiving than n8n's JSON.parse)              */
/* ------------------------------------------------------------------ */

export function extractJson<T = unknown>(raw: string): T {
  const text = String(raw ?? "").trim();
  if (!text) throw new Error("Empty agent output");

  // 1) Try direct parse.
  try {
    return JSON.parse(text) as T;
  } catch {
    /* keep going */
  }

  // 2) Strip markdown code fences.
  const fenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (fenced !== text) {
    try {
      return JSON.parse(fenced) as T;
    } catch {
      /* keep going */
    }
  }

  // 3) Find the outermost { ... } block (handles prose around JSON).
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const slice = fenced.slice(start, end + 1);
    try {
      return JSON.parse(slice) as T;
    } catch {
      /* keep going */
    }
  }

  throw new Error(`Agent output is not valid JSON: ${text.slice(0, 300)}`);
}
