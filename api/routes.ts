import type { Express } from "express";
import type { Server } from "http";
import Stripe from "stripe";
import express from "express";
import { PRICE_CREDIT_MAP, GENERATION_CREDIT_COST } from "../../shared/pricing";
import {
  supabaseAdmin,
  runDesignerTurn,
  runGenerationBatch,
  normalizeUserId,
  AbuseError,
  AgentOutputError,
} from "./lib/generation";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
});

const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const na = (v: unknown): string | null =>
  typeof v === "string" && v && v !== "N/A" ? v : null;

function parseMultipart(raw: Buffer, boundary: string): Record<string, string> {
  const out: Record<string, string> = {};
  const delim = `--${boundary}`;
  const parts = raw.toString("binary").split(delim).slice(1, -1);
  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd);
    const body = part.slice(headerEnd + 4).replace(/\r\n$/, "");
    const nameMatch = header.match(/name="([^"]+)"/);
    if (nameMatch) out[nameMatch[1]] = body;
  }
  return out;
}

export function registerRoutes(
  httpServer: Server,
  app: Express
): Server {
  // --- STRIPE WEBHOOK (MUST BE FIRST) ---
  app.post(
    "/api/stripe-webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const sig = req.headers["stripe-signature"] as string;
      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET!
        );
      } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      // DB idempotency (stripe_events has a unique constraint on event_id).
      const { error: dedupeError } = await supabaseAdmin
        .from("stripe_events")
        .insert({
          event_id: event.id,
          event_type: event.type,
          processed_at: new Date().toISOString(),
        });

      if (dedupeError && dedupeError.code === "23505") {
        return res.json({ received: true, duplicate: true });
      }
      if (dedupeError) {
        // Table missing or transient error — log and continue (do not lose the event).
        console.warn("[stripe] dedupe insert error:", dedupeError.message);
      }

      try {
        if (event.type === "checkout.session.completed") {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId;
          const mode = session.mode;

          // Metadata carries totalCredits (base × quantity); fall back to the shared map.
          const credits =
            Number(session.metadata?.credits || 0) ||
            PRICE_CREDIT_MAP[session.metadata?.priceId ?? ""] ||
            0;

          console.log("Webhook session.mode:", mode, "userId:", userId, "credits:", credits);

          if (userId && credits > 0) {
            const { error: rpcError } = await supabaseAdmin.rpc("increment_credits", {
              uid: userId,
              amount: credits,
            });

            if (rpcError) {
              console.error("Supabase RPC credit increment failed:", rpcError);
              return res.status(500).json({ error: "Failed to update credits" });
            }

            if (mode === "subscription" && session.customer && session.subscription) {
              const { error: subError } = await supabaseAdmin
                .from("user_subscriptions")
                .upsert(
                  {
                    user_id: userId,
                    stripe_customer_id: session.customer,
                    stripe_subscription_id: session.subscription,
                    subscription_status: "active",
                  },
                  { onConflict: "user_id" }
                );

              if (subError) {
                console.error("Supabase subscription upsert failed:", subError);
                return res.status(500).json({ error: "Failed to save subscription data" });
              }
            }
          }
        } else if (event.type === "invoice.paid") {
          // Renewal safety: only grant credits on recurring cycles.
          // The initial subscription is already granted in checkout.session.completed.
          const invoice = event.data.object as Stripe.Invoice;

          if (invoice.billing_reason === "subscription_cycle" && invoice.subscription) {
            const { data: sub } = await supabaseAdmin
              .from("user_subscriptions")
              .select("user_id")
              .eq("stripe_subscription_id", invoice.subscription)
              .maybeSingle();

            if (sub?.user_id) {
              const priceId = invoice.lines?.data?.[0]?.price?.id;
              const credits = priceId ? PRICE_CREDIT_MAP[priceId] ?? 0 : 0;

              if (credits > 0) {
                const { error: rpcError } = await supabaseAdmin.rpc("increment_credits", {
                  uid: sub.user_id,
                  amount: credits,
                });
                if (rpcError) console.error("invoice.paid credit grant failed:", rpcError);
              }

              await supabaseAdmin
                .from("user_subscriptions")
                .update({
                  subscription_status: "active",
                  updated_at: new Date().toISOString(),
                })
                .eq("stripe_subscription_id", invoice.subscription);
            }
          }
        } else if (event.type === "invoice.payment_failed") {
          // Subscription safety: no credits on failure — mark past_due.
          const invoice = event.data.object as Stripe.Invoice;
          if (invoice.subscription) {
            await supabaseAdmin
              .from("user_subscriptions")
              .update({
                subscription_status: "past_due",
                updated_at: new Date().toISOString(),
              })
              .eq("stripe_subscription_id", invoice.subscription);
          }
        } else if (
          event.type === "customer.subscription.updated" ||
          event.type === "customer.subscription.deleted"
        ) {
          const subscription = event.data.object as Stripe.Subscription;
          const subscriptionId = subscription.id;
          const status = subscription.status;
          const cancelAtPeriodEnd = subscription.cancel_at_period_end;
          const cancelAt = subscription.cancel_at;
          const cancelAtDate = cancelAt ? new Date(cancelAt * 1000).toISOString() : null;

          const { error: updateError } = await supabaseAdmin
            .from("user_subscriptions")
            .update({
              subscription_status: status,
              cancel_at_period_end: cancelAtPeriodEnd,
              cancel_at: cancelAtDate,
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", subscriptionId);

          if (updateError) {
            console.error("Supabase subscription update FAILED:", JSON.stringify(updateError));
          }
        }

        res.json({ received: true });
      } catch (err: any) {
        console.error("Webhook processing error:", err.message);
        res.status(500).json({ error: "Webhook processing failed" });
      }
    }
  );

  // --- DESIGNER CHAT (replaces the n8n proxy; MUST be before express.json for multipart) ---
  app.post("/api/generate-logo", async (req, res) => {
    try {
      const contentType = req.headers["content-type"] || "";

      // Read raw body (multipart or JSON — the client currently sends FormData).
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(chunks);

      let fields: Record<string, string> = {};

      if (contentType.includes("multipart/form-data")) {
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
        const boundary = boundaryMatch?.[1] || boundaryMatch?.[2] || "";
        if (!boundary) {
          return res.status(400).json({ error: "Missing multipart boundary" });
        }
        fields = parseMultipart(rawBody, boundary);
      } else if (rawBody.length) {
        try {
          const parsed = JSON.parse(rawBody.toString("utf8"));
          if (parsed && typeof parsed === "object") {
            fields = Object.fromEntries(
              Object.entries(parsed).map(([k, v]) => [k, String(v ?? "")])
            );
          }
        } catch {
          return res.status(400).json({ error: "Invalid JSON body" });
        }
      }

      const projectId = fields.projectId || "";
      const userId = normalizeUserId(fields.userId);
      const sessionId = fields.sessionId || null;
      const message = fields.message || "";
      const imageUsage = fields.imageUsage || null;
      const attachedImage = fields.attachedImage || null;

      if (!projectId) {
        return res.status(400).json({ error: "Missing projectId" });
      }
      if (!message.trim()) {
        return res.status(400).json({ error: "Missing message" });
      }

      console.log(`[generate-logo] pid=${projectId} user=${userId || "guest"} msg="${message.slice(0, 60)}"`);

      const turn = await runDesignerTurn({
        projectId,
        userId,
        sessionId,
        message,
        imageUsage,
        attachedImage,
      });

      // n8n "clean data" behaviour: briefs come from root meta ("N/A" → null).
      const designBrief1 = na(turn.meta?.design_brief_1);
      const designBrief2 = na(turn.meta?.design_brief_2);
      const referenceMode = na(turn.meta?.reference_mode);

      if (turn.status !== "ready_to_generate") {
        // Collecting info — reply normally (same shape as n8n Respond to Webhook).
        return res.json({
          text: turn.response,
          projectId,
        });
      }

      // Ready to generate — guest gate (same as n8n Open Modal Guest).
      if (!userId) {
        return res.json({
          text: "Starting generation engine...",
          trigger_modal: "signup_required",
          projectId,
        });
      }

      // Credit gate — logged-in users must have enough revisions (GENERATION_CREDIT_COST).
      const { data: creditRow } = await supabaseAdmin
        .from("user_credits")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();

      if (Number(creditRow?.balance ?? 0) < GENERATION_CREDIT_COST) {
        return res.json({
          status: "generation_failed",
          error:
            "You have used all your available revisions. Please add more to continue designing with the agent.",
        });
      }

      // n8n Respond to Webhook3 → { status: "generation_started", projectId }.
      // The slow part (Prompt Maker → kie.ai → upload) runs in /api/generate-images.
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const payload = {
        projectId,
        userId,
        responseText: turn.response || null,
        summary: turn.summary,
        designBrief1,
        designBrief2,
        imageUsage: imageUsage || null,
        attachedImage: attachedImage || null,
        referenceMode,
      };

      fetch(`${baseUrl}/api/generate-images`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${serviceKey()}`,
        },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch((err: any) => {
        console.error("[generate-logo] fire-and-forget failed:", err.message);
      });

      return res.json({ status: "generation_started", projectId });
    } catch (err: any) {
      if (err instanceof AbuseError) {
        return res.status(429).json({ error: "Too much abuse" });
      }
      if (err instanceof AgentOutputError) {
        console.error("[generate-logo] agent error:", err.message);
        return res.status(502).json({
          status: "generation_failed",
          error: "The designer could not process that request. Please try again.",
        });
      }
      console.error("[generate-logo] error:", err.message);
      res.status(500).json({
        status: "generation_failed",
        error: "Something went wrong. Please try again.",
      });
    }
  });

  // --- GLOBAL MIDDLEWARE FOR ALL OTHER ROUTES ---
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // --- ASYNC GENERATION WORKER (internal; self-re-invokes while polling) ---
  app.post("/api/generate-images", async (req, res) => {
    const auth = req.headers.authorization || "";
    if (!serviceKey() || auth !== `Bearer ${serviceKey()}`) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const {
      projectId,
      userId,
      responseText,
      summary,
      designBrief1,
      designBrief2,
      imageUsage,
      attachedImage,
      referenceMode,
    } = req.body || {};

    if (!projectId) {
      return res.status(400).json({ error: "missing projectId" });
    }

    try {
      await supabaseAdmin
        .from("projects")
        .update({ generation_status: "generating" })
        .eq("project_id", projectId);

      const result = await runGenerationBatch(
        {
          projectId,
          userId: normalizeUserId(userId),
          responseText: responseText || null,
          summary: summary || {},
          designBrief1: designBrief1 || null,
          designBrief2: designBrief2 || null,
          imageUsage: imageUsage || null,
          attachedImage: attachedImage || null,
          referenceMode: referenceMode || null,
        },
        { deadlineMs: 40_000 },
      );

      if (result.state === "pending") {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        fetch(`${baseUrl}/api/generate-images`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${serviceKey()}`,
          },
          body: JSON.stringify(req.body),
          keepalive: true,
        }).catch((err: any) => {
          console.error("[generate-images] re-trigger failed:", err.message);
        });
      }

      return res.json(result);
    } catch (err: any) {
      console.error("[generate-images] error:", err.message);
      await supabaseAdmin
        .from("projects")
        .update({ generation_status: "failed" })
        .eq("project_id", projectId);
      return res.status(500).json({ state: "failed", message: err.message });
    }
  });

  // --- CHAT CALLBACK (kept for backward compatibility during transition) ---
  app.post("/api/chat-callback", async (req, res) => {
    try {
      const { projectId, text, concept_1_url, concept_2_url, concept_1_title, concept_2_title, trigger_modal } = req.body;

      if (!projectId) {
        return res.status(400).json({ error: "Missing projectId" });
      }

      if (concept_1_url || concept_2_url) {
        const { data: projectRow } = await supabaseAdmin
          .from("projects")
          .select("user_id")
          .eq("project_id", projectId)
          .single();

        const { error: insertError } = await supabaseAdmin.from("logo_gallery").insert({
          user_id: projectRow?.user_id ?? null,
          project_id: projectId,
          concept_1_title: concept_1_title || null,
          concept_1_url: concept_1_url || null,
          concept_2_title: concept_2_title || null,
          concept_2_url: concept_2_url || null,
        });

        if (insertError) {
          console.error("[chat-callback] logo_gallery insert error:", insertError.message);
          return res.status(500).json({ error: "Failed to save logo to gallery" });
        }

        return res.json({ success: true, type: "logo" });
      }

      if (text) {
        const { error: insertError } = await supabaseAdmin
          .from("chat_messages")
          .insert({
            project_id: projectId,
            sender: "designer",
            content: text,
            created_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error("[chat-callback] chat_messages insert error:", insertError.message);
          return res.status(500).json({ error: "Failed to save message" });
        }

        return res.json({ success: true, type: "chat" });
      }

      res.status(400).json({ error: "No data to save" });
    } catch (error) {
      console.error("[chat-callback] Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- LOGO CALLBACK (kept for backward compatibility during transition) ---
  app.post("/api/logo-callback", async (req, res) => {
    try {
      const { projectId, response, concept_1_title, concept_1_url, concept_2_title, concept_2_url } = req.body;

      if (!projectId) {
        return res.json({ received: true, delivered: false, reason: "missing_projectId" });
      }

      try {
        const { data: projectRow } = await supabaseAdmin
          .from("projects")
          .select("user_id")
          .eq("project_id", projectId)
          .single();

        const { error: insertError } = await supabaseAdmin.from("logo_gallery").insert({
          user_id: projectRow?.user_id ?? null,
          project_id: projectId,
          concept_1_title: concept_1_title || null,
          concept_1_url: concept_1_url || null,
          concept_2_title: concept_2_title || null,
          concept_2_url: concept_2_url || null,
          response_text: response || null,
        });
        if (insertError) console.error("[callback] logo_gallery insert error:", insertError.message);

        try {
          const { data: creditRow } = await supabaseAdmin
            .from("user_credits")
            .select("balance")
            .eq("user_id", projectRow?.user_id)
            .single();

          if (creditRow) {
            const newBalance = Math.max(0, creditRow.balance - 10);
            const { error: creditError } = await supabaseAdmin
              .from("user_credits")
              .update({ balance: newBalance })
              .eq("user_id", projectRow?.user_id);

            if (creditError) {
              console.error("[callback] credit deduction error:", creditError.message);
            }
          }
        } catch (creditErr: any) {
          console.error("[callback] credit deduction threw:", creditErr.message);
        }
      } catch (dbErr: any) {
        console.error("[callback] logo_gallery save failed:", dbErr.message);
      }

      const { error: statusError } = await supabaseAdmin
        .from("projects")
        .update({ generation_status: "completed" })
        .eq("project_id", projectId);

      if (statusError) {
        console.error("[callback] generation_status update error:", statusError.message);
      }

      res.json({ received: true, delivered: true });
    } catch (err: any) {
      console.error("[callback] error:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/delete-account", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "Missing or invalid userId" });
      }
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) {
        console.error("Failed to delete user:", error);
        return res.status(500).json({ error: "Failed to delete account" });
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("Delete account error:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/check-subscription-cancel-at", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "User ID is required" });
      }
      const { data: subscription, error: queryError } = await supabaseAdmin
        .from("user_subscriptions")
        .select("cancel_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (queryError) {
        console.error("Failed to query cancel_at:", queryError);
        return res.status(500).json({ error: "Failed to check subscription status" });
      }

      const hasSubscription = subscription !== null;
      res.json({
        has_subscription: hasSubscription,
        cancel_at: subscription?.cancel_at ?? null,
      });
    } catch (error: any) {
      console.error("Check cancel_at error:", error.message);
      res.status(500).json({ error: "Failed to check subscription status" });
    }
  });

  app.post("/api/create-billing-portal-session", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "User ID is required" });
      }

      const { data: subscription, error: queryError } = await supabaseAdmin
        .from("user_subscriptions")
        .select("stripe_customer_id, subscription_status")
        .eq("user_id", userId)
        .maybeSingle();

      if (queryError) {
        console.error("Failed to query subscriptions:", queryError);
        return res.status(500).json({ error: "Failed to create billing portal session" });
      }

      if (!subscription || !subscription.stripe_customer_id) {
        return res.status(404).json({ error: "No active subscription found" });
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: subscription.stripe_customer_id,
        return_url: "https://easypeasylogo.com/profile",
      });

      res.json({ url: portalSession.url });
    } catch (error: any) {
      console.error("Billing portal session error:", error.message);
      res.status(500).json({ error: "Failed to create billing portal session" });
    }
  });

  app.post("/api/create-checkout-session", async (req, res) => {
    try {
      const { priceId, quantity, userId } = req.body;

      if (!priceId || typeof priceId !== "string") {
        return res.status(400).json({ error: "Missing or invalid priceId" });
      }

      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "Missing or invalid userId" });
      }

      const baseCredits = PRICE_CREDIT_MAP[priceId];
      if (!baseCredits) {
        return res.status(400).json({ error: "Invalid price mapping" });
      }

      const totalCredits = baseCredits * (quantity && quantity > 0 ? quantity : 1);

      let price: Stripe.Price;
      try {
        price = await stripe.prices.retrieve(priceId);
      } catch {
        return res.status(400).json({ error: "Invalid Stripe price ID" });
      }

      if (!price.active) {
        return res.status(400).json({ error: "Price is no longer active" });
      }

      const mode: Stripe.Checkout.SessionCreateParams["mode"] =
        price.type === "recurring" ? "subscription" : "payment";

      const origin = "https://easypeasylogo.com";

      const session = await stripe.checkout.sessions.create({
        mode,
        line_items: [
          {
            price: priceId,
            quantity: quantity && quantity > 0 ? quantity : 1,
          },
        ],
        metadata: {
          userId: userId,
          credits: totalCredits.toString(),
          priceId: priceId,
        },
        success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/checkout`,
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error("Stripe checkout error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
