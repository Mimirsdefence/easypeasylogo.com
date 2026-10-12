/**
 * Generation pipeline — the code rebuild of the n8n "Brand-Identity-Designer"
 * workflow: Agent 1 (design chat) → Agent 2 (Prompt Maker) → kie.ai Nano Banana
 * (Gemini 2.5 Flash Image — see lib/kie.ts for the model choice)
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
import { buildOverlayText, reviewConcepts, type ReviewResult } from "./platform-reviewer";
import { composePlatformImage } from "./overlay";
import { needsCodeOverlay, resolvePlatformSpec, type PlatformSpec } from "../../shared/platforms";
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

/**
 * Resolve the concrete platform canvas from the Agent-1 summary.
 * `null` means "no specific platform matched" — the generator decides freely.
 */
export function specFromSummary(summary: unknown): PlatformSpec | null {
  const s = (summary ?? {}) as BrandSummary;
  return resolvePlatformSpec({
    assetType: s.asset?.type,
    platform: s.asset?.platform,
    format: s.asset?.format,
  });
}

function textUsageFromSummary(summary: unknown): string | null {
  const s = (summary ?? {}) as BrandSummary;
  return s.asset?.text_usage ?? null;
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
  /** deterministic platform review (format/ratio, divergence, overlay plan) */
  review: ReviewResult;
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

  // Code-layer quality gate: force the platform canvas ratio, tell the generator
  // to keep the safe zone free of text where the server draws it, and push the
  // two concepts apart when Agent 2 returned two flavours of the same layout.
  const review = reviewConcepts({
    summary: input.summary ?? {},
    assetType: (input.summary as BrandSummary | null)?.asset?.type,
    platform: (input.summary as BrandSummary | null)?.asset?.platform,
    format: (input.summary as BrandSummary | null)?.asset?.format,
    textUsage: (input.summary as BrandSummary | null)?.asset?.text_usage,
    concepts: concepts.map((concept, i) => ({
      index: i,
      sceneTitle: concept.scene_title,
      finalPrompt: concept.final_prompt,
      aspectRatio: concept.aspect_ratio,
      imageInput: concept.image_input,
    })),
  });

  const reviewNotes = [
    ...review.issues,
    ...review.concepts.flatMap((c) => c.issues.map((issue) => `concept ${c.index + 1}: ${issue}`)),
  ];
  if (reviewNotes.length) {
    console.warn(`[generation] platform review (${review.specId ?? "no spec"}): ${reviewNotes.join(" | ")}`);
  }

  const patchedConcepts = concepts.map((concept, i) => {
    const reviewed = review.concepts[i];
    if (!reviewed || !reviewed.patched) return concept;
    return {
      ...concept,
      final_prompt: reviewed.patchedPrompt,
      aspect_ratio: reviewed.aspectRatio || concept.aspect_ratio,
    };
  });

  return { response: String(parsed?.response ?? ""), concepts: patchedConcepts, review };
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

  const { concepts, review } = await runPromptMaker(input);

  // The stored payload keeps the exact kie.ai input at the top level and adds the
  // review below it, so a finished job can be audited without another Grok call.
  const reviewRecord = {
    specId: review.specId,
    similarity: review.similarity,
    divergent: review.divergent,
    overlay: review.overlay,
    issues: review.issues,
    concepts: review.concepts.map((c) => ({
      index: c.index,
      archetypes: c.archetypes,
      patched: c.patched,
      issues: c.issues,
    })),
  };

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
      payload: { ...apiPayload, review: reviewRecord },
    });
  }

  return concepts.length;
}

/** What the server needs in order to finish a raw generator output in code. */
interface ComposeRequest {
  spec: PlatformSpec;
  headline: string;
  subline: string | null;
  textUsage: unknown;
}

interface UploadResult {
  /** public Storage URL of the shipped artwork */
  url: string;
  /** true when the bytes were re-composed in code (crop to canvas + text overlay) */
  composed: boolean;
  /** human-readable audit trail; empty means "nothing to report" */
  notes: string[];
}

/**
 * Download the generator output, finish it server-side (exact platform canvas +
 * code-drawn text where the spec asks for it) and store the result. The raw
 * generator URLs stay in `generation_jobs.raw_urls`; a compose failure degrades
 * gracefully to the untouched image instead of failing the whole batch.
 */
async function uploadToStorage(
  projectId: string,
  conceptIndex: number,
  url: string,
  compose?: ComposeRequest | null,
): Promise<UploadResult> {
  const notes: string[] = [];
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    let buf = Buffer.from(await res.arrayBuffer());
    const extMatch = url.match(/\.(png|jpe?g|webp)/i);
    let ext = (extMatch?.[1] || "jpg").toLowerCase();
    let composed = false;

    if (compose?.spec) {
      try {
        const result = await composePlatformImage(buf, {
          spec: compose.spec,
          headline: compose.headline,
          subline: compose.subline,
          textUsage: compose.textUsage,
        });
        buf = result.buffer;
        ext = result.format === "png" ? "png" : "jpg";
        composed = true;
        notes.push(...result.notes);
        if (result.width !== compose.spec.width || result.height !== compose.spec.height) {
          notes.push(
            `canvas mismatch after compose: ${result.width}x${result.height} != ${compose.spec.width}x${compose.spec.height}`,
          );
        }
        if (needsCodeOverlay(compose.spec, compose.textUsage) && !result.textDrawn) {
          notes.push("code overlay was required but no text was drawn");
        }
      } catch (err: any) {
        console.warn(`[generation] overlay compose failed, keeping raw image: ${err.message}`);
        notes.push(`overlay failed: ${err.message}`);
      }
    }

    const path = `${projectId}/${Date.now()}-${conceptIndex}.${ext}`;
    const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

    const { error } = await supabaseAdmin.storage
      .from("generations")
      .upload(path, buf, { contentType, upsert: true });

    if (error) throw new Error(error.message);

    const { data } = supabaseAdmin.storage.from("generations").getPublicUrl(path);
    if (data?.publicUrl) return { url: data.publicUrl, composed, notes };
    throw new Error("no public url");
  } catch (err: any) {
    console.warn(`[generation] Storage upload failed, using temporary URL: ${err.message}`);
    return { url, composed: false, notes: [...notes, `upload failed: ${err.message}`] };
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
  const deadline = Date.now() + (opts.deadlineMs ?? 52_000);

  // Resolve the canvas + overlay text once: the summary was refreshed by Agent 1
  // in the same turn, and buildOverlayText mirrors the reviewer's overlay plan.
  const spec = specFromSummary(input.summary);
  const textUsage = textUsageFromSummary(input.summary);
  const overlayText = buildOverlayText(input.summary);
  const compose: ComposeRequest | null = spec
    ? { spec, headline: overlayText.headline, subline: overlayText.subline, textUsage }
    : null;

  if (spec && needsCodeOverlay(spec, textUsage) && !overlayText.headline) {
    console.warn(`[generation] ${spec.label} needs a code overlay but the summary carries no brand name/text`);
  }

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
          const uploaded = await uploadToStorage(input.projectId, job.concept_index, info.resultUrls[0], compose);
          const priorPayload = job.payload && typeof job.payload === "object" ? job.payload : {};
          await supabaseAdmin
            .from("generation_jobs")
            .update({
              status: "done",
              result_url: uploaded.url,
              raw_urls: info.resultUrls,
              payload: {
                ...priorPayload,
                artwork: {
                  specId: spec?.id ?? null,
                  composed: uploaded.composed,
                  notes: uploaded.notes,
                },
              },
            })
            .eq("id", job.id);
          if (uploaded.notes.length) {
            console.warn(`[generation] job ${job.id} artwork notes: ${uploaded.notes.join(" | ")}`);
          }
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

    // Post-generation audit trail: every note the reviewer or the code overlay
    // left behind means the shipped artwork deviates from the plan. Surface it
    // in one line per batch instead of digging through the job rows later.
    const audit = sorted.flatMap((job: any) => {
      const notes: string[] = Array.isArray(job.payload?.artwork?.notes) ? job.payload.artwork.notes : [];
      const reviewIssues: string[] = Array.isArray(job.payload?.review?.issues) ? job.payload.review.issues : [];
      const labels = [...notes, ...reviewIssues];
      return labels.map((n) => `concept ${Number(job.concept_index) + 1}: ${n}`);
    });
    if (audit.length) {
      console.warn(`[generation] finalized with review/overlay notes: ${audit.join(" | ")}`);
    }

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
