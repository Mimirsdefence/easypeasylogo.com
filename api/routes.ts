import type { Express } from "express";
import type { Server } from "http";
import Stripe from "stripe";
import express from "express";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
});

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const processedEvents = new Set<string>();

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

      if (processedEvents.has(event.id)) {
        return res.json({ received: true });
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const credits = Number(session.metadata?.credits || 0);
        const mode = session.mode;

        console.log("Webhook session.mode:", mode, "userId:", userId);

        if (userId) {
          try {
            const { error: rpcError } = await supabaseAdmin.rpc("increment_credits", {
              uid: userId,
              amount: credits,
            });

            if (rpcError) {
              console.error("Supabase RPC credit increment failed:", rpcError);
              return res.status(500).json({ error: "Failed to update credits" });
            }

            if (mode === "subscription" && session.customer && session.subscription) {
              console.log("Saving subscription data - customer:", session.customer, "subscription:", session.subscription);

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

              console.log("Subscription data saved successfully");
            }
          } catch (error) {
            console.error("Critical error during checkout fulfillment:", error);
            return res.status(500).json({ error: "Internal server error during fulfillment" });
          }
        }
      } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const status = subscription.status;
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;
        const cancelAt = subscription.cancel_at;
        const cancelAtDate = cancelAt ? new Date(cancelAt * 1000).toISOString() : null;

        console.log("Webhook subscription event:", event.type, "subscriptionId:", subscriptionId, "status:", status, "cancelAtPeriodEnd:", cancelAtPeriodEnd, "cancelAt RAW:", cancelAt, "cancelAtDate:", cancelAtDate);

        const updatePayload = {
          subscription_status: status,
          cancel_at_period_end: cancelAtPeriodEnd,
          cancel_at: cancelAtDate,
          updated_at: new Date().toISOString(),
        };

        console.log("Supabase update payload:", JSON.stringify(updatePayload));

        try {
          const { data: updateData, error: updateError } = await supabaseAdmin
            .from("user_subscriptions")
            .update(updatePayload)
            .eq("stripe_subscription_id", subscriptionId)
            .select();

          if (updateError) {
            console.error("Supabase subscription update FAILED:", JSON.stringify(updateError));
            // Do not return error - let webhook complete successfully
          } else {
            console.log("Supabase subscription update SUCCESS. Rows matched:", updateData?.length ?? 0, "data:", JSON.stringify(updateData));
          }
        } catch (error) {
          console.error("Error processing subscription event:", error);
          // Do not return error - let webhook complete successfully
        }
      }

      processedEvents.add(event.id);
      res.json({ received: true });
    }
  );

  // --- GENERATE LOGO PROXY (MUST BE BEFORE express.json() TO READ RAW BODY) ---
  app.post("/api/generate-logo", async (req, res) => {
    try {
      const apiUrl = process.env.VITE_API_BASE_URL;
      if (!apiUrl) {
        console.error("[proxy] VITE_API_BASE_URL is not configured");
        return res.status(500).json({ error: "VITE_API_BASE_URL is not configured" });
      }

      console.log("[proxy] generate-logo request received");
      console.log("[proxy] Content-Type:", req.headers["content-type"]);
      console.log("[proxy] Query:", req.query);

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(chunks);
      console.log("[proxy] Raw body size:", rawBody.length);

      const upstream = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "content-type": req.headers["content-type"] ?? "",
        },
        body: rawBody,
      });

      console.log("[proxy] n8n responded with status:", upstream.status);

      if (!upstream.ok) {
        console.error(`[proxy] n8n returned ${upstream.status}`);
        return res.status(upstream.status).json({ error: `Upstream error: ${upstream.status}` });
      }

      const data = await upstream.json();
      console.log("[proxy] n8n response:", JSON.stringify(data).slice(0, 200));
      res.json(data);
    } catch (err: any) {
      console.error("[proxy] generate-logo error:", err.message);
      res.status(502).json({ error: "Failed to reach generation service" });
    }
  });

  // --- GLOBAL MIDDLEWARE FOR ALL OTHER ROUTES ---
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // --- CHAT CALLBACK (receives responses from n8n) ---
  app.post("/api/chat-callback", async (req, res) => {
    try {
      const { projectId, text, concept_1_url, concept_2_url, concept_1_title, concept_2_title, trigger_modal } = req.body;

      console.log("[chat-callback] Received:", { projectId, text: text?.substring(0, 50), concept_1_url, trigger_modal });

      if (!projectId) {
        console.warn("[chat-callback] Missing projectId");
        return res.status(400).json({ error: "Missing projectId" });
      }

      if (concept_1_url || concept_2_url) {
        console.log("[chat-callback] Saving to logo_gallery...");
        
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

        console.log("[chat-callback] Logo saved to gallery successfully");
        return res.json({ success: true, type: "logo" });
      }

      if (text) {
        console.log("[chat-callback] Saving to chat_messages...");
        
        const { error: insertError } = await supabaseAdmin
          .from("chat_messages")
          .insert({
            project_id: projectId,
            sender: "designer",
            content: text,
            created_at: new Date().toISOString()
          });

        if (insertError) {
          console.error("[chat-callback] chat_messages insert error:", insertError.message);
          return res.status(500).json({ error: "Failed to save message" });
        }

        console.log("[chat-callback] Message saved to chat_messages successfully");
        return res.json({ success: true, type: "chat" });
      }

      console.warn("[chat-callback] No data to save");
      res.status(400).json({ error: "No data to save" });

    } catch (error) {
      console.error("[chat-callback] Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- LOGO CALLBACK (called by n8n after async generation) ---
  app.post("/api/logo-callback", async (req, res) => {
    try {
      console.log("FULL CALLBACK DATA:", req.body);
      const { projectId, response, concept_1_title, concept_1_url, concept_2_title, concept_2_url } = req.body;

      if (!projectId) {
        console.warn("[callback] Missing projectId — returning 200 anyway");
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
        else console.log(`[callback] saved to logo_gallery pid=${projectId}`);

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
            } else {
              console.log(`[callback] deducted 10 credits from user=${projectRow?.user_id}, new balance=${newBalance}`);
            }
          } else {
            console.warn("[callback] no user_credits row found for user_id:", projectRow?.user_id);
          }
        } catch (creditErr: any) {
          console.error("[callback] credit deduction threw:", creditErr.message);
        }
      } catch (dbErr: any) {
        console.error("[callback] logo_gallery save failed:", dbErr.message);
      }

      console.log(`[callback] Setting generation_status to "completed" for project ${projectId}`);
      const { error: statusError } = await supabaseAdmin
        .from("projects")
        .update({ generation_status: "completed" })
        .eq("project_id", projectId);

      if (statusError) {
        console.error("[callback] generation_status update error:", statusError.message);
      } else {
        console.log(`[callback] generation_status updated to "completed" for project ${projectId}`);
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
        cancel_at: subscription?.cancel_at ?? null 
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
    console.log("CHECKOUT HIT");
    console.log("HEADERS:", req.headers["content-type"]);
    console.log("BODY RAW:", req.body);
    console.log("IS BUFFER:", Buffer.isBuffer(req.body));
    console.log("SUPABASE URL:", process.env.VITE_SUPABASE_URL);
    console.log("SERVICE ROLE EXISTS:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    try {
      const { priceId, quantity, userId } = req.body;
      console.log("PRICE ID:", priceId);
      console.log("USER ID:", userId);
      console.log("QUANTITY:", quantity);

      if (!priceId || typeof priceId !== "string") {
        return res.status(400).json({ error: "Missing or invalid priceId" });
      }

      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "Missing or invalid userId" });
      }

      // ✅ UPDATED: Live Price IDs with correct credit mapping
      const PRICE_CREDIT_MAP: Record<string, number> = {
        "price_1TvG7n0IfYdAlbaaeFio0fDS": 50,    // Starter Pack (5 revisions)
        "price_1TvG7o0IfYdAlbaaq4hLeJYL": 50,    // 5 revisions
        "price_1TvG7l0IfYdAlbaawtqWABhv": 250,   // 25 revisions
        "price_1TvG7j0IfYdAlbaaANQOBR0F": 500,   // 50 revisions
        "price_1TvG7p0IfYdAlbaatlAQEsF7": 100,   // Pro Plan (monthly)
        "price_1TvG7p0IfYdAlbaartzEYmnh": 300,   // Studio Plan (monthly)
        "price_1TvG7j0IfYdAlbaaVeUVBov0": 600    // Enterprise Plan (monthly)
      };

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

      try {
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
            priceId: priceId
          },
          success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/checkout`,
        });

        console.log("SESSION CREATED:", session.url);
        res.json({ url: session.url });
      } catch (err: any) {
        console.error("STRIPE SESSION ERROR:", err);
        throw err;
      }
    } catch (err: any) {
      console.error("Stripe checkout error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}