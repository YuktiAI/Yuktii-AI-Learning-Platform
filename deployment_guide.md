# Deployment Guide — Yuktii AI Labs Platform

## Overview: What Gets Deployed Where

```
┌─────────────────────────────────────────────────────────┐
│  Your Project Has 2 Deployables + 2 Infrastructure      │
├─────────────────┬───────────────────────────────────────┤
│  yuktii-platform│  Next.js app (frontend + API routes)  │  → Vercel
│  eval-worker    │  BullMQ background job processor       │  → Railway
│  Neon Postgres  │  Database                              │  ✅ Already live
│  Upstash Redis  │  Job queue                             │  ✅ Already live
└─────────────────┴───────────────────────────────────────┘
```

> **Why Railway for the worker?** Vercel is serverless — functions time out after 10–60s. The evaluation worker runs for 5–15 minutes per job. It must be a persistent always-on process, which Railway supports.

---

## Part 1 — Push Code to GitHub (Do This First)

Both Vercel and Railway deploy from GitHub. Your repo is already connected:
`https://github.com/YuktiAI/Yuktii-AI-Learning-Platform`

```powershell
cd c:\Users\India\Downloads\yuktii-ai-labs-platform-phase1-2
git add .
git commit -m "prod: deploy-ready"
git push origin main
```

> ⚠️ `.env`, `.env.local`, `dev.db`, `node_modules` are all in `.gitignore` — they will NOT be pushed.

---

## Part 2 — Deploy Frontend on Vercel

### Step 1: Go to vercel.com → New Project
1. Click **"Add New Project"**
2. Click **"Import Git Repository"** → select `YuktiAI/Yuktii-AI-Learning-Platform`
3. **Root Directory** → set to `yuktii-platform` (important — not the root)
4. Framework preset → Vercel will auto-detect **Next.js** ✅
5. Click **"Environment Variables"** and add ALL of these:

### Vercel Environment Variables

> Copy your real values from your local `.env` file in `yuktii-platform/`.

| Name | Description |
|------|-------------|
| `DATABASE_URL` | Neon pooled connection string |
| `DIRECT_DATABASE_URL` | Neon direct (non-pooled) connection string |
| `JWT_SECRET` | Long random string — generate: `openssl rand -base64 48` |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL (e.g. `https://yuktii.vercel.app`) — update after first deploy |
| `RESEND_API_KEY` | Your Resend.com API key |
| `RESEND_FROM` | e.g. `Yuktii AI Labs <noreply@yuktiiai.in>` |
| `DISABLE_PAYMENT_GATEWAY` | `false` in production, `true` to bypass payments in testing |
| `RAZORPAY_KEY_ID` | Your Razorpay key ID |
| `RAZORPAY_KEY_SECRET` | Your Razorpay secret |
| `S3_BUCKET` | Your S3 bucket name (e.g. `yuktii-certificates`) |
| `S3_REGION` | e.g. `ap-south-1` |
| `S3_ACCESS_KEY_ID` | Your AWS IAM access key |
| `S3_SECRET_ACCESS_KEY` | Your AWS IAM secret |
| `CERT_HMAC_SECRET` | Generate: `openssl rand -hex 32` |
| `GROQ_API_KEY` | Your Groq API key |
| `GEMINI_API_KEY` | Your Google Gemini API key |
| `OPENROUTER_API_KEY` | Your OpenRouter API key |
| `CEREBRAS_API_KEY` | Your Cerebras API key |
| `REDIS_URL` | Your Upstash Redis `rediss://...` URL |
| `GITHUB_TOKEN` | GitHub PAT with `public_repo` read scope |
| `E2B_API_KEY` | Your E2B sandbox API key |
| `EVALUATION_PASS_SCORE` | `70` |
| `DETERMINISTIC_GATE_THRESHOLD` | `0.3` |
| `OPENHANDS_MAX_ITERATIONS` | `20` |
| `SWE_AGENT_MAX_ITERATIONS` | `10` |
| `EVALUATION_TIMEOUT_MS` | `900000` |

### Step 2: Deploy
Click **"Deploy"**. Vercel will:
- Install dependencies
- Run `npx prisma generate && next build`
- Deploy to a `.vercel.app` URL

### Step 3: After first deploy — update NEXT_PUBLIC_APP_URL
Once you get your Vercel URL (e.g. `https://yuktii-ai-labs.vercel.app`):
- Go to Vercel → Project Settings → Environment Variables
- Update `NEXT_PUBLIC_APP_URL` to your actual URL
- Click **Redeploy**

---

## Part 3 — Deploy Evaluation Worker on Railway

> **Why not Vercel?** The worker is a long-running process (5–15 min per evaluation). Vercel functions time out. Railway keeps it running 24/7.

### Step 1: Go to railway.app → New Project
1. Click **"Deploy from GitHub repo"**
2. Select `YuktiAI/Yuktii-AI-Learning-Platform`
3. **Root Directory** → leave as `/` (repo root — the `railway.toml` is in `evaluation-worker/` and sets `cd evaluation-worker` automatically)
4. Railway will read `evaluation-worker/railway.toml` automatically

### Step 2: Add Environment Variables on Railway

> Copy your real values from your local `evaluation-worker/.env` file.

| Name | Description |
|------|-------------|
| `DATABASE_URL` | Neon pooled connection string |
| `DIRECT_DATABASE_URL` | Neon direct connection string |
| `REDIS_URL` | Upstash Redis `rediss://...` URL |
| `GROQ_API_KEY` | Your Groq API key |
| `GEMINI_API_KEY` | Your Google Gemini API key |
| `OPENROUTER_API_KEY` | Your OpenRouter API key |
| `CEREBRAS_API_KEY` | Your Cerebras API key |
| `GITHUB_TOKEN` | GitHub PAT with `public_repo` read scope |
| `E2B_API_KEY` | Your E2B sandbox API key |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL |
| `RESEND_API_KEY` | Your Resend API key |
| `RESEND_FROM` | e.g. `Yuktii AI Labs <noreply@yuktiiai.in>` |
| `EVALUATION_PASS_SCORE` | `70` |
| `DETERMINISTIC_GATE_THRESHOLD` | `0.3` |
| `OPENHANDS_MAX_ITERATIONS` | `20` |
| `SWE_AGENT_MAX_ITERATIONS` | `10` |
| `EVALUATION_TIMEOUT_MS` | `900000` |
| `WORKER_CONCURRENCY` | `2` |
| `LOG_LEVEL` | `info` |
| `NODE_ENV` | `production` |

### Step 3: Deploy
Railway will build and start the worker automatically. You'll see logs like:
```
[worker] BullMQ worker started — listening on queue: evaluation-queue
```

---

## Part 4 — Final Checklist After Deploy

- [ ] Vercel URL works → visit your `.vercel.app` URL
- [ ] Update `NEXT_PUBLIC_APP_URL` on both Vercel and Railway to your actual URL → redeploy
- [ ] Sign up a test student account → OTP email arrives
- [ ] Log in → dashboard loads
- [ ] Admin portal loads at `/admin-portal`
- [ ] Submit a stage evaluation → Railway worker picks it up (check Railway logs)
- [ ] Check `/admin-portal/error-logs` → should be empty (good!)

---

## Architecture Summary

```
Student Browser
     │
     ▼
┌─────────────┐     Queue job      ┌──────────────────┐
│   Vercel    │ ─────────────────► │    Railway       │
│  Next.js    │   (Upstash Redis)  │  Eval Worker     │
│  Frontend   │                    │  (BullMQ)        │
│  + API      │                    └────────┬─────────┘
└──────┬──────┘                             │
       │                                    │
       ▼                                    ▼
┌─────────────────────────────────────────────────────┐
│              Neon PostgreSQL                         │
│  Students · Enrollments · Evaluations · ErrorLogs   │
└─────────────────────────────────────────────────────┘
```
