/**
 * kie.ai Nano Banana 2 helper — same endpoints as the n8n workflow.
 */

const KIE_BASE = "https://api.kie.ai/api/v1";

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
  const body = {
    model: "nano-banana-2",
    input: {
      prompt: payload.prompt || "",
      image_input: Array.isArray(payload.image_input) ? payload.image_input : [],
      aspect_ratio: payload.aspect_ratio || "auto",
      resolution: payload.resolution || "1K",
      output_format: payload.output_format || "jpg",
    },
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
