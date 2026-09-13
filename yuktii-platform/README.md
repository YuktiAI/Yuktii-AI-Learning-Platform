# Yuktii AI Labs — Self-Paced Internship Platform

A self-paced, project-based internship and certification platform for Indian students, built by
**Yuktii AI Labs**. Students choose a domain and a duration bundle, complete real project-style
work independently (no live human mentor — self-check against a model answer and rubric), and
receive a verifiable digital certificate on completion.

This repo implements **Phase 1 (Foundation)** and **Phase 2 (Core Learning Loop)** from the build
guide, end to end, plus the schema and hooks Phase 3 (AI-variation) and Phase 4 (scale/polish)
plug into. See [Build status](#build-status) below for exactly what's live vs. stubbed.

## Tech stack

- Frontend: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Backend: Next.js API routes
- Database: PostgreSQL + Prisma ORM
- Auth: JWT session cookie (`lib/auth.ts`)
- Payments: Razorpay (order creation + webhook)
- Certificates: `qrcode` for QR generation; PDF rendering is a follow-up (see status below)
- Background jobs: BullMQ + Redis — wired for Phase 3, not yet invoked
- AI generation: Anthropic Claude API — wired for Phase 3, not yet invoked

## Getting started

```bash
npm install
cp .env.example .env
# fill in DATABASE_URL at minimum to run locally; everything else can stay blank until
# you reach that phase (payments, AI, file storage)

npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed        # creates the 8 domains + one admin login

npm run dev
```

The seed script prints an admin login (default `admin@yuktiiai.in` / `changeme123` unless you set
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env` first). **Change that password after first
login** — there's no self-service password change yet, so update it directly via
`npx prisma studio` (hash a new one with `bcryptjs`) or add that screen before going live.

Log in at `/login` with the admin account, then go to `/admin` (not linked from the public nav) to
load in the real domain/track/stage content from your separately-drafted briefs.

## Build status

**Phase 1 — Foundation: done**
- Marketing site: homepage, 8 domain pages, pricing, about, FAQ
- Student signup/login (JWT session cookie)
- Admin panel: CRUD for Domains, Tracks (with publish/draft toggle), Stages
- Razorpay order creation + webhook to confirm payment and flip enrollment status

**Phase 2 — Core learning loop: done, static content (no AI-variation yet, as instructed)**
- Student dashboard listing enrollments and progress
- Per-track page: plain-language intro → task brief → submit → model answer → rubric self-check
- Certificate auto-created on final-stage self-check, with a public verification page at
  `/verify/[certificateId]` (no login required) and QR code
- **Not yet done:** rendering the certificate to an actual PDF (`Certificate.pdfUrl` field exists,
  nothing writes to it yet) — needs S3/Cloudinary credentials wired into a PDF-generation step

**Phase 3 — AI differentiation layer: schema-ready, not implemented**
- `Enrollment.aiVariantJson` field exists and the track page already checks for it and displays it
  when present — but nothing generates it yet
- To build: a BullMQ job triggered from the Razorpay webhook on `payment.captured`, calling the
  Claude API to generate a scenario variant seeded by student profile, with a duplicate-check
  against recent variants in the same track before saving

**Phase 4 — Polish/scale: schema-ready, not implemented**
- `Institution` model and `Student.institutionId` exist; no UI
- `Submission.similarityScore` field exists for a future plagiarism-similarity check; not computed
- No analytics dashboard yet

## Project structure

```
/app
  /(marketing pages)     homepage, /domains/[slug], /pricing, /about, /faq
  /login, /signup         auth pages
  /dashboard              student dashboard + /dashboard/track/[id]
  /admin                  internal CRUD panel (Domains, Tracks, Stages)
  /verify, /verify/[id]   public certificate verification
  /api                    auth, admin CRUD, enrollments, submissions, webhooks
/prisma
  schema.prisma           full data model
  seed.ts                 seeds 8 domains + one admin login
/lib                      prisma client, auth helpers, static domain copy
/components                Navbar, Footer
```

## Design notes

Palette and type are deliberately not the generic AI-tool defaults: cool off-white background,
ink-navy text, a marigold/gold accent (nods to a credential being "earned," not a generic SaaS
teal), Fraunces for display type paired with Inter for body/UI and JetBrains Mono for stage/
certificate IDs. The homepage's duration ladder is the signature element, since duration bundles
are the actual structuring mechanic of the product — not decoration.

## What's deliberately not decided yet (per the source brief)

- Final brand name/logo/color palette beyond this placeholder direction
- Final pricing per duration (admin panel lets you set it per track; public pages just say
  "announced at checkout" until you do)
- Full curriculum content for all 8 domains × 5 durations — load this through `/admin` once drafted

## Known environment note

Prisma's `generate` step downloads a query-engine binary from `binaries.prisma.sh`. If you're
running this inside a network-restricted sandbox, that domain needs to be reachable — on a normal
machine, CI runner, or Vercel/Railway build, this works out of the box with no extra config.
