## Third-Party Services Setup

### Use existing or get a new dedicated Gmail account.

---

## Google Cloud
- Create a VM (e2-standard-4 recommended).
- **Make the external IP static** – this is required so your DNS records don't break.
- Install Docker + docker-compose and n8n locally. In N8N settings "Save successful production executions" set it to "Not save", takes up unnecessary memory.

---

## Namecheap (Domain – `easypeasylogo.com`)

### After the domain transfer

1. Log in to your NameCheap account.
2. Go to **Domain List** → click `easypeasylogo.com`.
3. Click **Manage** → **Advanced DNS**.
4. Add these records:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A Record | @ | `216.198.79.1` | Automatic |
| A Record | api | `YOUR_VM_STATIC_IP` | Automatic |
| TXT Record | @ | `v=spf1 include:spf.efwd.registrar-servers.com ~all` | Automatic |

5. Wait 5–10 minutes for DNS propagation.
6. Test: `https://easypeasylogo.com` and `https://api.easypeasylogo.com` should work.

---

## Upstash Redis (Insert in N8N)

1. Go to Upstash → sign up / log in.
2. Click **Redis** → **Create Database**.
3. Choose **Global** or **AWS / eu-central-1** (or region closest to you).
4. Select **Free Tier** (500K commands/month – plenty).
5. Copy the **Endpoint** (e.g., `curious-impala-108365.upstash.io`) and **Port** (`6379`).
6. Copy the **Token** – this is your password.

┌─────────────────────────────────────────────────────────────────────────────┐
│                      📦 N8N REDIS CONNECTION WINDOW                        │
├─────────────────────┬─────────────────────────────┬─────────────────────────┤
│ Label in n8n        │ What to paste / select      │ Where to get it         │
├─────────────────────┼─────────────────────────────┼─────────────────────────┤
│ Host                │ curious-impala-108365       │ Your Upstash Endpoint –  │
│                     │ .upstash.io                 │ remove https://. Just    │
│                     │                             │ the plain domain.        │
├─────────────────────┼─────────────────────────────┼─────────────────────────┤
│ Port                │ 6379                        │ Always this number.      │
├─────────────────────┼─────────────────────────────┼─────────────────────────┤
│ Username            │ default                     │ Type the word "default"  │
│                     │                             │ – do NOT leave blank.    │
├─────────────────────┼─────────────────────────────┼─────────────────────────┤
│ Password            │ ********                    │ Your Upstash Token –     │
│                     │ (paste your actual token)   │ click "Reveal" to copy.  │
├─────────────────────┼─────────────────────────────┼─────────────────────────┤
│ Database            │ 0                           │ Leave as 0 unless you    │
│                     │                             │ created a different one. │
├─────────────────────┼─────────────────────────────┼─────────────────────────┤
│ SSL                 │ Toggle ON / Enabled         │ Must be turned ON.       │
└─────────────────────┴─────────────────────────────┴─────────────────────────┘

---

## Cloudinary (Insert in Vercel and N8N)

**⚠️ Important:** Before importing the n8n workflow, you must install the Cloudinary node from the n8n marketplace. Go to **Settings → Community Nodes → Install** and search for "Cloudinary". Install it first, then import the workflow JSON.

| Step | Action |
|------|--------|
| 1 | Sign up at cloudinary.com |
| 2 | From Dashboard → copy your **Cloud Name** (e.g., `dslsh60bi`). |
| 3 | Go to **Settings** → **Upload** → **Add Upload Preset** → name it (e.g., `easy-logo-preset`) → **Mode: Unsigned** → Save. Copy the preset name. |

### Where to put the keys

| Service | Key | Value |
|---------|-----|-------|
| **Vercel** | `VITE_CLOUDINARY_CLOUD_NAME` | Cloud Name |
| **Vercel** | `VITE_CLOUDINARY_PRESET` | Upload Preset name |
| **n8n** | Cloudinary credentials | Cloud Name, API Key, API Secret (from Dashboard → Account Details) |

**Note:** Free tier includes 25 credits/month – plenty for this use case.

---

## Kie.ai + xAI Grok (Insert in N8N)
- Get your API keys from each service.
- **xAI Grok:** Insert in n8n **Credential** section.
- **kie.ai:** Insert directly in the **HTTP node** inside the n8n workflow (not in Credentials).
- See the video for exact locations.

---

## Supabase (Insert in Vercel)
- Create a free account.

| Variable | Where to find it |
|----------|------------------|
| `VITE_SUPABASE_URL` | Project Settings → General → Project ID → add `https://YourProjectID.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API Keys → Click **"Legacy anon, service_role API keys"** → copy the **anon public** key |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API Keys → Click **"Legacy anon, service_role API keys"** → copy the **service_role secret** key |

- **I send the entire project over** – all tables, RLS policies, functions, and data structure are already applied. You don't need to run any SQL.

- You will also need to set up **Google OAuth**:
  - Copy the **Callback URL** from Supabase → Authentication → Providers → Enable Google.
  - Add it to your Google Cloud Console → OAuth 2.0 credentials.
  - Paste the Client ID + Secret back into Supabase.

---

## Stripe (Insert in Vercel)
- Create a Stripe account.
- I will send over a **fully configured setup** – webhooks, products, price IDs are all ready.
- In Vercel, add the 3 keys from your **Live** Stripe account:

| Vercel Key | Stripe Value |
|------------|--------------|
| `VITE_STRIPE_PUBLIC_KEY` | `pk_live_...` |
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (from your Live webhook) |

### Setting up the Stripe Webhook (To get the `STRIPE_WEBHOOK_SECRET`)

1. **Go to Stripe Dashboard** → make sure you're in **Live mode** (toggle at the top).
2. **Developers** → **Webhooks** → **Add endpoint**.
3. **Endpoint URL:** `https://easypeasylogo.com/api/stripe-webhook`
4. **Select events:** Choose **"Select events"** and add these 3:

| Event | Why it's needed |
|-------|-----------------|
| `checkout.session.completed` | Adds credits to the user's account after purchase. |
| `invoice.paid` | Updates subscription status when payment succeeds. |
| `invoice.payment_failed` | Updates subscription status when payment fails. |

5. Click **"Add endpoint"**.
6. Copy the **Signing secret** (starts with `whsec_...`) – this is your `STRIPE_WEBHOOK_SECRET`.

**Note:** The webhook must be set up in **Live mode**, not Test mode. The secret is different for each mode.

---

## Session Secret (Insert in Vercel)

| Variable | What to do |
|----------|------------|
| `SESSION_SECRET` | Generate a strong random string – use: `openssl rand -base64 32` (or any random generator) |

This is used for session encryption. Just generate a random string and paste it into Vercel.

---

## Vite API Base URL (Insert in Vercel)

| Variable | Value |
|----------|-------|
| `VITE_API_BASE_URL` | Your n8n public URL – `https://api.easypeasylogo.com/webhook/designer-chat`

---

## Vercel
- Make an account (you can use GitHub or sign up with email).
- This is where the website will live.
- Insert all environment variables (keys) from the list above.
- Deploy the code.
- Test the website – everything should work.

---

## What I send over (in the handover folder)

| File | Purpose |
|------|---------|
| `ReadMe.txt` | Full documentation |
| `n8n-workflow.json` | The AI designer workflow – import directly into n8n |
| `docker-compose.yml` | Pre‑configured n8n setup (concurrency 20) |
| `setup-api-keys.mp4` | Short video showing where to insert all API keys |

---

## Quick checklist

| Step | Done? |
|------|-------|
| Google Cloud VM running (static IP) | 🔲 |
| n8n installed via Docker | 🔲 |
| n8n workflow imported | 🔲 |
| All API keys inserted in n8n | 🔲 |
| Supabase project received (SQL already applied) | 🔲 |
| Google OAuth set up | 🔲 |
| All Vercel env vars added | 🔲 |
| Vercel deployment successful | 🔲 |
| Domain DNS records updated | 🔲 |
| Website works (chat, generation, Stripe) | 🔲 |

---

**Good luck with your new business!**