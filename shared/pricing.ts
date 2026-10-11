/**
 * STRIPE PRICING — SINGLE SOURCE OF TRUTH
 * ------------------------------------------------------------------
 * These are the TEST-mode price IDs created 2026-10-11 and saved in
 * `.stripe-map.json`. Both the server (webhook credit mapping +
 * checkout validation) and the client (Checkout.tsx) import from here.
 *
 * When you go LIVE: create the same 6 products/prices in Stripe LIVE
 * mode and replace the IDs below with the live IDs. Keep the same
 * credit amounts so renewals/credits keep working.
 */

export type PriceMode = "payment" | "subscription";

export interface PriceDef {
  id: string;
  name: string;
  /** Credits ("revisions") granted per purchase / per billing cycle */
  credits: number;
  mode: PriceMode;
  /** Display price in USD (test catalog) */
  usd: string;
}

export const STRIPE_PRICES: PriceDef[] = [
  { id: "price_1UPOUGE6cAak7KnPS4Qpac2w", name: "Starter Pack", credits: 50, mode: "payment", usd: "$7.49" },
  { id: "price_1UPOUHE6cAak7KnPdzUPyCH7", name: "Pro Pack", credits: 250, mode: "payment", usd: "$34.99" },
  { id: "price_1UPOUIE6cAak7KnPBVgRFZQG", name: "Studio Pack", credits: 500, mode: "payment", usd: "$59.99" },
  { id: "price_1UPOUKE6cAak7KnPiaWbtC8Q", name: "Pro Plan", credits: 100, mode: "subscription", usd: "$13.99/mo" },
  { id: "price_1UPOULE6cAak7KnP3odlgs2P", name: "Studio Plan", credits: 300, mode: "subscription", usd: "$27.00/mo" },
  { id: "price_1UPOUME6cAak7KnPrO8fh06o", name: "Enterprise Plan", credits: 600, mode: "subscription", usd: "$49.99/mo" },
];

/** priceId -> credits, used by the Stripe webhook. */
export const PRICE_CREDIT_MAP: Record<string, number> = Object.fromEntries(
  STRIPE_PRICES.map((p) => [p.id, p.credits]),
);

/** Cost of one generation round (2 concepts) in credits. */
export const GENERATION_CREDIT_COST = 10;

export function getPriceDef(priceId: string): PriceDef | undefined {
  return STRIPE_PRICES.find((p) => p.id === priceId);
}
