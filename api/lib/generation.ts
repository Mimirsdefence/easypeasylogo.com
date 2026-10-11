/**
 * Generation pipeline — the code rebuild of the n8n "Brand-Identity-Designer"
 * workflow: Agent 1 (design chat) → Agent 2 (Prompt Maker) → kie.ai Nano Banana 2
 * → Supabase Storage → gallery + credits.
 */
import { getSupabaseAdmin } from "./supabase";
import { callGrok, type GrokMessage } from "./xai";
import { createKieTask, getKieRecordInfo } from "./kie";
import {
  AGENT1_SYSTEM_PROMPT,
  AGENT2_SYSTEM_PROMPT,
  buildAgent1UserMessage,
  buildAgent2UserMessage,
  detectRefusal,
  extractJson,
  type BrandSummary,
} from "./prompts";
import { GENERATION_CREDIT_COST } from "../../shared/pricing";

export { GENERATION_CREDIT_COST };

export const supabaseAdmin = getSupabaseAdmin();

const ABUSE_LIMIT = 10;
const IMAGE_INTENTS = new Set(["inspiration", "reference"]);

export class AbuseError extends Error {
  constructor() {
    super("Abuse limit reached");
    this.name = "AbuseError";
  }
}

export class AgentOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentOutputError";
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function normalizeUserId(userId: unknown): string | null {
  if (typeof userId === "string" && userId && userId !== "null" && userId !== "undefined") {
    return userId;
  }
  return null;
}

function hasImage(imageUsage: unknown, attachedImage: unknown): attachedImage is string {
  return (
    typeof attachedImage === "string" &&
    attachedImage.length > 0 &&
    typeof imageUsage === "string" &&
    IMAGE_INTENTS.has(imageUsage)
  );
}

export function buildUserContent(
  text: string,
  attachedImage: string | null | undefined,
  imageUsage: string | null | undefined,
): string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> {
  if (hasImage(imageUsage, attachedImage)) {
    return [
      { type: "text", text },
      { type: "image_url", image_url: { url: attachedImage } },
    ];
  }
  return text;
}

/* ------------------------------------------------------------------ */
/* Chat state (replaces Upstash Redis `summary:{projectId}`)           */
/* ------------------------------------------------------------------ */

export interface ChatState {
  summary: Record<string, unknown>;
  abuseCount: number;
  seedUrls: string[];
}

export async function getChatState(projectId: string): Promise<ChatState> {
  const { data } = await supabaseAdmin
    .from("project_chat_state")
    .select("summary, abuse_count, seed_urls")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!data) {
    await supabaseAdmin.from("project_chat_state").insert({ project_id: projectId });
    return { summary: {}, abuseCount: 0, seedUrls: [] };
  }

  return {
    summary: (data.summary && typeof data.summary === "object" ? data.summary : {}) as Record<string, unknown>,
    abuseCount: Number(data.abuse_count ?? 0),
    seedUrls: Array.isArray(data.seed_urls) ? data.seed_urls.map(String) : [],
  };
}

export async function saveChatState(
  projectId: string,
  state: { summary: Record<string, unknown>; abuseCount: number; seedUrls?: string[] },
): Promise<void> {
  await supabaseAdmin.from("project_chat_state").upsert({
    project_id: projectId,
    summary: state.summary,
    abuse_count: state.abuseCount,
    seed_urls: state.seedUrls ?? [],
    updated_at: new Date().toISOString(),
  }, { onConflict: "project_id" });
}

/* ------------------------------------------------------------------ */
/* Chat history (replaces Upstash Redis chat memory)                   */
/* ------------------------------------------------------------------ */

export async function loadChatHistory(args: {
  projectId: string;
  userId: string | null;
  sessionId?: string | null;
  excludeMessage?: string | null;
  limit?: number;
}): Promise<GrokMessage[]> {
  const limit = args.limit ?? 16;
  const user = normalizeUserId(args.userId);

  let rows: Array<{ sender: string; content: string }> = [];

  if (user) {
    const { data } = await supabaseAdmin
      .from("chat_messages")
      .select("sender, content")
      .eq("project_id", args.projectId)
      .order("created_at", { ascending: true })
      .limit(limit);
    rows = data ?? [];
  } else if (args.sessionId) {
    const { data } = await supabaseAdmin
      .from("guest_messages")
      .select("sender, content")
      .eq("guest_session_id", args.sessionId)
      .order("created_at", { ascending: true })
      .limit(limit);
    rows = data ?? [];
  }

  const messages: GrokMessage[] = rows.map((r) => ({
    role: r.sender === "user" ? "user" : "assistant",
    content: String(r.content ?? ""),
  }));

  // The frontend inserts the current user message optimistically; if it is
  // already the tail of history, drop it — the rendered template carries it.
  if (
    args.excludeMessage &&
    messages.length &&
    messages[messages.length - 1].role === "user" &&
    messages[messages.length - 1].content === args.excludeMessage
  ) {
    messages.pop();
  }

  return messages;
}

/* ------------------------------------------------------------------ */
/* Agent 1 — design chat turn                                          */
/* ------------------------------------------------------------------ */

export interface DesignerTurnResult {
  response: string;
  status: string;
  abuseLevel: string;
  summary: Record<string, unknown>;
  meta: Record<string, unknown> | null;
  raw: string;
}

export async function runDesignerTurn(args: {
  projectId: string;
  userId: string | null;
  sessionId?: string | null;
  message: string;
  imageUsage?: string | null;
  attachedImage?: string | null;
}): Promise<DesignerTurnResult> {
  const state = await getChatState(args.projectId);
  if (state.abuseCount >= ABUSE_LIMIT) throw new AbuseError();

  const history = await loadChatHistory({
    projectId: args.projectId,
    userId: args.userId,
    sessionId: args.sessionId,
    excludeMessage: args.message,
  });

  const userText = buildAgent1UserMessage({
    abuseCount: state.abuseCount,
    summary: state.summary,
    message: args.message,
    imageUsage: args.imageUsage,
    attachedImage: args.attachedImage,
  });

  const baseMessages: GrokMessage[] = [
    { role: "system", content: AGENT1_SYSTEM_PROMPT },
    ...history,
  ];
  const userContent = buildUserContent(userText, args.attachedImage, args.imageUsage);

  let raw = await callGrok(
    [...baseMessages, { role: "user", content: userContent }],
    { maxTokens: 1024, temperature: 0.7, topP: 0.9 },
  );

  // n8n stopped the workflow on refusal — we surface it as an error too.
  if (detectRefusal(raw)) {
    throw new AgentOutputError("Designer refused the request");
  }

  let parsed: any;
  try {
    parsed = extractJson(raw);
  } catch {
    raw = await callGrok(
      [
        ...baseMessages,
        { role: "user", content: userContent },
        { role: "assistant", content: raw.slice(0, 4000) },
        {
          role: "user",
          content:
            "Your last response was not valid JSON. Reply with ONLY the required JSON object and nothing else.",
        },
      ],
      { maxTokens: 1024, temperature: 0.7, topP: 0.9 },
    );
    parsed = extractJson(raw);
  }

  const control = parsed?.control && typeof parsed.control === "object" ? parsed.control : {};
  const status = String(control.status || "collecting");
  const abuseLevel = String(control.abuse_level || "normal");
  const summary =
    parsed?.summary && typeof parsed.summary === "object" ? parsed.summary : {};
  const meta = parsed?.meta && typeof parsed.meta === "object" ? parsed.meta : null;

  // FIX vs n8n: n8n double-counted (`current + (current + inc)`); store current + inc.
  const inc = abuseLevel === "severe" ? 2 : abuseLevel === "mild" ? 1 : 0;
  const newAbuse = state.abuseCount + inc;

  await saveChatState(args.projectId, {
    summary,
    abuseCount: newAbuse,
    seedUrls: state.seedUrls,
  });

  return {
    response: String(parsed?.response ?? ""),
    status,
    abuseLevel,
    summary,
    meta,
    raw,
  };
}

/* ------------------------------------------------------------------ */
/* Agent 2 — Prompt Maker                                              */
/* ------------------------------------------------------------------ */

export interface PromptMakerInput {
  summary: BrandSummary | Record<string, unknown> | null;
  designBrief1?: string | null;
  designBrief2?: string | null;
  imageUsage?: string | null;
  attachedImage?: string | null;
  referenceMode?: string | null;
}

export interface ConceptPayload {
  scene_title: string;
  final_prompt: string;
  image_input: string[];
  aspect_ratio: string;
  resolution: string;
  output_format: string;
}

export async function runPromptMaker(input: PromptMakerInput): Promise<{
  response: string;
  concepts: ConceptPayload[];
}> {
  const userText = buildAgent2UserMessage({
    summary: input.summary as BrandSummary | null,
    designBrief1: input.designBrief1,
    designBrief2: input.designBrief2,
    imageUsage: input.imageUsage,
    attachedImage: input.attachedImage,
    referenceMode: input.referenceMode,
  });

  const content = buildUserContent(userText, input.attachedImage, input.imageUsage);

  let raw = await callGrok(
    [
      { role: "system", content: AGENT2_SYSTEM_PROMPT },
      { role: "user", content },
    ],
    { maxTokens: 2048, temperature: 0.7, topP: 0.9 },
  );

  let parsed: any;
  try {
    parsed = extractJson(raw);
  } catch {
    raw = await callGrok(
      [
        { role: "system", content: AGENT2_SYSTEM_PROMPT },
        { role: "user", content },
        { role: "assistant", content: raw.slice(0, 4000) },
        {
          role: "user",
          content:
            "Your last response was not valid JSON. Reply with ONLY the required JSON object and nothing else.",
        },
      ],
      { maxTokens: 2048, temperature: 0.7, topP: 0.9 },
    );
    parsed = extractJson(raw);
  }

  const payloads = parsed?.prompt_payloads;
  if (!payloads || !payloads.prompt_1 || !payloads.prompt_2) {
    throw new AgentOutputError("Missing 'prompt_1' or 'prompt_2' inside prompt_payloads.");
  }

  const concepts = [payloads.prompt_1, payloads.prompt_2].map((concept: any, idx: number) => {
    if (!concept || typeof concept.final_prompt !== "string") {
      throw new AgentOutputError(`Concept at index ${idx} is missing 'final_prompt'.`);
    }
    return {
      scene_title: String(concept.scene_title || `Concept ${idx + 1}`),
      final_prompt: concept.final_prompt,
      image_input: Array.isArray(concept.image_input) ? concept.image_input.map(String) : [],
      aspect_ratio: String(concept.aspect_ratio || "auto"),
      resolution: String(concept.resolution || "1K"),
      output_format: String(concept.output_format || "jpg"),
    } satisfies ConceptPayload;
  });

  return { response: String(parsed?.response ?? ""), concepts };
}

/* ------------------------------------------------------------------ */
/* kie.ai jobs + polling + finalize                                    */
/* ------------------------------------------------------------------ */

export interface GenerationBatchInput extends PromptMakerInput {
  projectId: string;
  userId: string | null;
  responseText?: string | null;
}

export async function ensureKieJobs(input: GenerationBatchInput): Promise<number> {
  const { data: existing } = await supabaseAdmin
    .from("generation_jobs")
    .select("id")
    .eq("project_id", input.projectId)
    .limit(1);

  if (existing && existing.length) return existing.length;

  const { concepts } = await runPromptMaker(input);

  for (let i = 0; i < concepts.length; i++) {
    const concept = concepts[i];
    const apiPayload = {
      prompt: concept.final_prompt,
      image_input: concept.image_input,
      aspect_ratio: concept.aspect_ratio,
      resolution: concept.resolution,
      output_format: concept.output_format,
    };
    const taskId = await createKieTask(apiPayload);

    await supabaseAdmin.from("generation_jobs").insert({
      project_id: input.projectId,
      user_id: normalizeUserId(input.userId),
      concept_index: i,
      scene_title: concept.scene_title,
      kie_task_id: taskId,
      status: "queued",
      payload: apiPayload,
    });
  }

  return concepts.length;
}

async function uploadToStorage(projectId: string, conceptIndex: number, url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const extMatch = url.match(/\.(png|jpe?g|webp)/i);
    const ext = (extMatch?.[1] || "jpg").toLowerCase();
    const path = `${projectId}/${Date.now()}-${conceptIndex}.${ext}`;

    const { error } = await supabaseAdmin.storage
      .from("generations")
      .upload(path, buf, { contentType: `image/${ext}`, upsert: true });

    if (error) throw new Error(error.message);

    const { data } = supabaseAdmin.storage.from("generations").getPublicUrl(path);
    if (data?.publicUrl) return data.publicUrl;
    throw new Error("no public url");
  } catch (err: any) {
    console.warn(`[generation] Storage upload failed, using temporary URL: ${err.message}`);
    return url;
  }
}

async function deductCredits(userId: string): Promise<void> {
  const { data: creditRow } = await supabaseAdmin
    .from("user_credits")
    .select("balance")
    .eq("user_id", userId)
    .single();

  if (!creditRow) return;

  const newBalance = Math.max(0, creditRow.balance - GENERATION_CREDIT_COST);
  await supabaseAdmin
    .from("user_credits")
    .update({ balance: newBalance })
    .eq("user_id", userId);
}

export type GenerationBatchState =
  | { state: "completed" }
  | { state: "pending"; message: string }
  | { state: "failed"; message: string };

export async function runGenerationBatch(
  input: GenerationBatchInput,
  opts: { deadlineMs?: number } = {},
): Promise<GenerationBatchState> {
  const deadline = Date.now() + (opts.deadlineMs ?? 40_000);

  try {
    await ensureKieJobs(input);
  } catch (err: any) {
    console.error("[generation] ensureKieJobs failed:", err.message);
    await supabaseAdmin
      .from("projects")
      .update({ generation_status: "failed" })
      .eq("project_id", input.projectId);
    return { state: "failed", message: err.message };
  }

  while (Date.now() < deadline) {
    const { data: pending } = await supabaseAdmin
      .from("generation_jobs")
      .select("*")
      .eq("project_id", input.projectId)
      .in("status", ["queued", "running"]);

    if (!pending || pending.length === 0) {
      return finalizeGeneration(input);
    }

    for (const job of pending) {
      try {
        await supabaseAdmin
          .from("generation_jobs")
          .update({ status: "running" })
          .eq("id", job.id);

        const info = await getKieRecordInfo(job.kie_task_id);

        if (info.state === "success" && info.resultUrls.length) {
          const stableUrl = await uploadToStorage(input.projectId, job.concept_index, info.resultUrls[0]);
          await supabaseAdmin
            .from("generation_jobs")
            .update({ status: "done", result_url: stableUrl, raw_urls: info.resultUrls })
            .eq("id", job.id);
        } else if (info.state === "failed" || info.state === "error" || info.state === "cancelled") {
          await supabaseAdmin
            .from("generation_jobs")
            .update({ status: "failed" })
            .eq("id", job.id);
        }
      } catch (err: any) {
        console.warn(`[generation] job ${job.id} poll error: ${err.message}`);
      }
    }

    await new Promise((r) => setTimeout(r, 4_000));
  }

  return { state: "pending", message: "still generating" };
}

async function finalizeGeneration(input: GenerationBatchInput): Promise<GenerationBatchState> {
  // Guard against two concurrent pollers (fire-and-forget + self-re-trigger):
  // atomically claim "done" jobs by marking them "finalized". Only the poller
  // that actually claims rows inserts the gallery row and deducts credits.
  const { data: claimed } = await supabaseAdmin
    .from("generation_jobs")
    .update({ status: "finalized" })
    .eq("project_id", input.projectId)
    .eq("status", "done")
    .select("*");

  if (claimed && claimed.length > 0) {
    const sorted = claimed.sort(
      (a: any, b: any) => Number(a.concept_index) - Number(b.concept_index),
    );

    const { data: projectRow } = await supabaseAdmin
      .from("projects")
      .select("user_id")
      .eq("project_id", input.projectId)
      .single();

    const userId = normalizeUserId(projectRow?.user_id ?? input.userId);

    const { error: insertError } = await supabaseAdmin.from("logo_gallery").insert({
      user_id: userId,
      project_id: input.projectId,
      concept_1_title: sorted[0]?.scene_title ?? "Concept 1",
      concept_1_url: sorted[0]?.result_url ?? null,
      concept_2_title: sorted[1]?.scene_title ?? "Concept 2",
      concept_2_url: sorted[1]?.result_url ?? null,
      response_text: input.responseText ?? null,
    });

    if (insertError) console.error("[generation] logo_gallery insert error:", insertError.message);

    if (userId) {
      await deductCredits(userId).catch((err) =>
        console.error("[generation] credit deduction error:", err.message),
      );
    }

    await supabaseAdmin
      .from("projects")
      .update({ generation_status: "completed" })
      .eq("project_id", input.projectId);

    return { state: "completed" };
  }

  // Nothing to claim. Either another poller already finalized, or everything failed.
  const { data: alreadyFinalized } = await supabaseAdmin
    .from("generation_jobs")
    .select("id")
    .eq("project_id", input.projectId)
    .eq("status", "finalized")
    .limit(1);

  if (alreadyFinalized && alreadyFinalized.length > 0) {
    return { state: "completed" };
  }

  await supabaseAdmin
    .from("projects")
    .update({ generation_status: "failed" })
    .eq("project_id", input.projectId);

  return { state: "failed", message: "All concepts failed" };
}
