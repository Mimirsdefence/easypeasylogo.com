/**
 * kie.ai image helper — Google "Nano Banana" = Gemini 2.5 Flash Image.
 *
 * Same job endpoints as the n8n workflow, but two model ids of the Flash tier are
 * used depending on the payload:
 *   - `google/nano-banana`       text-to-image
 *   - `google/nano-banana-edit`  image-to-image (reference photo / uploaded logo)
 *
 * Why Flash and not the Pro tier (`nano-banana-2`, 1K/2K/4K): the Pro model gives
 * sharper in-image text but routinely needs 40-90s for two concepts, which does
 * not fit the 60s serverless budget. The Flash tier returns in a fraction of that,
 * and brand text is drawn in code by the overlay anyway — see shared/platforms.ts.
 */

const KIE_BASE = "https://api.kie.ai/api/v1";

const MODEL_TEXT_TO_IMAGE = "google/nano-banana";
const MODEL_IMAGE_TO_IMAGE = "google/nano-banana-edit";

/**
 * Aspect ratios the Flash tier accepts. Unlike the Pro tier it has no 4:1 / 8:1 /
 * 1:4 / 1:8, so `closestRatio` snaps the LinkedIn banner (1584x396 = 4:1) to 21:9;
 * the server overlay crops the result back to the exact canvas.
 */
const SUPPORTED_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] as const;

/** "16:9" -> 1.777…, anything unparsable -> null. */
function parseRatio(ratio?: string): number | null {
  const match = String(ratio ?? "").trim().match(/^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : null;
}

/**
 * Snap whatever the Prompt Maker asked for to a ratio the model can actually
 * render. Compared in log space so 4:1 is as far from 3:1 as 1:4 is from 1:3.
 * "auto" and unparsable values are passed through — the model picks, the overlay
 * still crops to the platform canvas.
 */
export function closestRatio(ratio?: string): string {
  const raw = String(ratio ?? "").trim().toLowerCase();
  if (!raw || raw === "auto") return "auto";

  const asked = parseRatio(raw);
  if (!asked) return "auto";

  let best: string = SUPPORTED_RATIOS[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of SUPPORTED_RATIOS) {
    const parsed = parseRatio(candidate);
    if (!parsed) continue;
    const distance = Math.abs(Math.log(parsed) - Math.log(asked));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** The Flash tier spells JPEG as `jpeg` (the Pro tier used `jpg`) and prefers png. */
function outputFormat(format?: string): string {
  const clean = String(format ?? "").trim().toLowerCase().replace(/^\./, "");
  return clean === "png" ? "png" : "jpeg";
}

export interface KieApiPayload {
  prompt: string;
  image_input?: string[];
  aspect_ratio?: string;
  resolution?: string;
  output_format?: string;
}

export class KieError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function apiKey(): string {
  const key = process.env.KIEAI_API_KEY;
  if (!key) throw new KieError(500, "KIEAI_API_KEY is not configured");
  return key;
}

export async function createKieTask(payload: KieApiPayload): Promise<string> {
  const references = Array.isArray(payload.image_input)
    ? payload.image_input.map((url) => String(url ?? "").trim()).filter(Boolean).slice(0, 10)
    : [];
  const imageToImage = references.length > 0;

  const input: Record<string, unknown> = {
    prompt: payload.prompt || "",
    aspect_ratio: closestRatio(payload.aspect_ratio),
    output_format: outputFormat(payload.output_format),
  };
  if (imageToImage) input.image_urls = references;
  // `payload.resolution` is deliberately not sent: the Flash tier has no 1K/2K/4K
  // knob and rejects unknown fields. The stored job payload keeps it for auditing.

  const body = {
    model: imageToImage ? MODEL_IMAGE_TO_IMAGE : MODEL_TEXT_TO_IMAGE,
    input,
  };

  let res: Response;
  try {
    res = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    throw new KieError(502, `Failed to reach kie.ai: ${err.message}`);
  }

  const text = await res.text().catch(() => "");
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON error */ }

  if (!res.ok) {
    throw new KieError(res.status, `kie.ai createTask error ${res.status}: ${text.slice(0, 400)}`);
  }

  const taskId = data?.data?.taskId;
  if (!taskId) throw new KieError(502, `kie.ai createTask returned no taskId: ${text.slice(0, 400)}`);
  return String(taskId);
}

export interface KieRecordInfo {
  state: string;
  resultUrls: string[];
  raw: unknown;
}

export async function getKieRecordInfo(taskId: string): Promise<KieRecordInfo> {
  let res: Response;
  try {
    res = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { authorization: `Bearer ${apiKey()}` },
    });
  } catch (err: any) {
    throw new KieError(502, `Failed to reach kie.ai: ${err.message}`);
  }

  const text = await res.text().catch(() => "");
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON error */ }

  if (!res.ok) {
    throw new KieError(res.status, `kie.ai recordInfo error ${res.status}: ${text.slice(0, 400)}`);
  }

  const state = String(data?.data?.state ?? data?.state ?? "unknown");
  let resultUrls: string[] = [];

  const raw = data?.data?.resultJson ?? data?.resultJson;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.resultUrls)) resultUrls = parsed.resultUrls.map(String);
    } catch { /* ignore */ }
  } else if (raw && Array.isArray(raw?.resultUrls)) {
    resultUrls = raw.resultUrls.map(String);
  } else if (Array.isArray(data?.data?.resultUrls)) {
    resultUrls = data.data.resultUrls.map(String);
  }

  return { state, resultUrls, raw: data };
}

export async function waitForKieTask(
  taskId: string,
  opts: { deadlineMs: number; pollIntervalMs?: number } = { deadlineMs: 50_000, pollIntervalMs: 3_000 },
): Promise<KieRecordInfo> {
  const interval = opts.pollIntervalMs ?? 3_000;
  const deadline = Date.now() + opts.deadlineMs;

  while (Date.now() < deadline) {
    const info = await getKieRecordInfo(taskId);
    if (info.state === "success") return info;
    if (info.state === "failed" || info.state === "error" || info.state === "cancelled") {
      throw new KieError(502, `kie.ai task ${taskId} ended in state "${info.state}"`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new KieError(504, `kie.ai task ${taskId} timed out after ${opts.deadlineMs}ms`);
}
