# فِطنة (Fitna AI) — Production

> محاكي الفصل الدراسي الذكي: منصة تدريب تربوي صوتية تفاعلية بطلابٍ افتراضيين،
> بواجهة عربية فصحى كاملة (RTL) ونمطي تحدث صوتيين للوكلاء: **السعودي** و**المصري**.

**Fitna AI** is a production-ready, security-hardened rebuild of the Fitna classroom
simulator: teachers rehearse classroom management through voice-driven role-play with
four autonomous virtual students, receive instant pedagogical diagnostics (teacher-talk
ratio, Socratic questioning rate, inclusivity index), and earn verified badges.

---

## المعمارية | Architecture

```
Browser (RTL MSA UI)
   │  fetch + HttpOnly session cookie + CSRF header
   ▼
Next.js 16 App Router (Node runtime, server-only secrets)
   ├── Auth: scrypt + DB-backed opaque sessions (HMAC-hashed tokens)
   ├── Dialect engine: profile → STT locale + agent prompt + TTS voice
   ├── AI layer: Groq llama-3.3-70b → deterministic fallback engine
   ├── Speech: /api/tts (Edge neural voices) · /api/stt (Groq Whisper v3)
   ▼
Prisma ORM ── Neon PostgreSQL (pooled connection)
```

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 + React 19 + TypeScript 5 | App Router, server components, route handlers |
| UI | Tailwind CSS 4 + shadcn/ui + Cairo/Tajawal fonts | Arabic-first RTL design system |
| Database | Neon PostgreSQL + Prisma | Serverless Postgres, typed queries, migrations |
| Auth | Custom: scrypt hashing + opaque DB sessions | No third-party dependency; full control; HTTP-only cookies |
| AI | Groq `llama-3.3-70b-versatile` | Dialectal Arabic reactions; deterministic fallback without key |
| STT | Groq `whisper-large-v3` | Best-in-class Arabic dialect ASR; dialect-biased prompts |
| TTS | Microsoft Edge neural voices | Free (no API key), native `ar-SA` + `ar-EG` neural voices |
| Email | Resend (optional) | Password-reset links |

## نظام اللهجات | Dialect system

The critical product rule:

| | UI language | AI speech |
|---|---|---|
| Saudi user | العربية الفصحى | اللهجة السعودية (ar-SA voices) |
| Egyptian user | العربية الفصحى | اللهجة المصرية (ar-EG voices) |

* The dialect lives in the **server-side user profile** (`profiles.dialect`) — a client can
  never dictate it for real conversations (only an explicit settings change can).
* `src/lib/dialect/config.ts` is the single source of truth: STT locale + bias prompt,
  agent system-prompt block, and TTS voice mapping per dialect.
* Adding a future dialect = one entry in `DIALECT_CONFIG`. No code duplication.

## الوكلاء | AI agents

Four configurable student personas (`sara`, `omar`, `yassin`, `nour`) with distinct
personalities, comprehension levels, attention baselines, and gender-matched voices.
Agent definitions are seeded into the `agents` table and support per-agent
`systemPrompt` templates with a `{{DIALECT_BLOCK}}` placeholder injected per user.

Prompt-injection defense: user speech is fenced as **data** inside the user message
(labeled `<<<TEACHER_SPEECH>>>`), never merged into system instructions; the system
prompt re-asserts the child-persona contract on every call.

## قاعدة البيانات | Database schema

`users` · `profiles` (dialect, user type) · `auth_sessions` · `password_reset_tokens` ·
`agents` · `lesson_topics` · `sim_sessions` (dialect snapshot + telemetry) ·
`session_events` (conversation log) · `reports` (MSA diagnostics + framework scores) ·
`badges` · `speech_settings` · `audit_logs`.

Migrations live in `prisma/migrations/` (applied with `prisma migrate deploy`).

## الأمان | Security model

* **AuthN** — scrypt password hashing (OWASP params), opaque 32-byte session tokens,
  DB stores SHA-256(HMAC(token)) only; rolling 7-day expiry; full revocation on
  password change/reset and account deletion.
* **AuthZ** — every API route resolves the user server-side; ownership is enforced in
  the query (`where: { id, userId }`) → IDOR-safe by construction (404, not 403).
* **CSRF** — SameSite=Lax cookies + Origin/Referer verification + mandatory
  `X-Requested-With` custom header on all state-changing endpoints.
* **Rate limiting** — in-memory sliding windows per route (login/signup/STT/TTS/turn/…).
  Per-instance on serverless; swap in Upstash Redis for global limits at scale.
* **Headers** — CSP, X-Frame-Options DENY, nosniff, HSTS, Referrer-Policy,
  Permissions-Policy (micphone self / camera geolocation denied).
* **Validation** — zod schemas on every input; JSON body size caps; audio size caps.
* **Errors** — user-facing messages are generic Arabic; stack traces and provider
  errors never leave the server; logs are structured JSON with no secrets.
* **Audit** — `audit_logs` records auth events, dialect changes, deletions (IP hashed).

## التشغيل المحلي | Local development

```bash
bun install
cp .env.example .env.local        # fill DATABASE_URL + AUTH_SECRET (min)
bunx prisma migrate dev           # apply schema to your Neon branch
bun run dev                       # http://localhost:3000
```

Without `GROQ_API_KEY` the app is fully functional (deterministic engine + text input).

## النشر إلى الإنتاج | Production deployment (Vercel + Neon)

1. Import the repo into Vercel (framework preset: Next.js).
2. Set environment variables (Production):
   `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`,
   optionally `GROQ_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`.
3. Apply migrations once: `DATABASE_URL=... bunx prisma migrate deploy`.
4. Visit `/api/health` — expect `{"ok":true, checks:{database:"up", ...}}`.

## متغيرات البيئة | Environment variables

See [.env.example](./.env.example). Summary:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string (server-only) |
| `AUTH_SECRET` | ✅ | Session token HMAC pepper (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | ✅ (prod) | Canonical origin (email links, CSRF) |
| `GROQ_API_KEY` | ➖ | AI reactions + Whisper STT (fallback engine without it) |
| `RESEND_API_KEY` / `EMAIL_FROM` | ➖ | Password-reset emails |
| `TTS_PROVIDER` / `STT_PROVIDER` | ➖ | Provider selection (default: msedge / groq) |

## الاختبارات | Verification performed

* API end-to-end suite (40 checks): auth flows, CSRF, IDOR, rate limits (429),
  malformed/oversized payloads, XSS inertness, dialect switching, TTS audio bytes,
  report generation, account deletion — all passing.
* Browser E2E: signup wizard → login → dashboard → session setup → live room
  (text turn with student reactions) → report → history → settings.

## القيود المعروفة | Known limitations

* Rate limiting is per-serverless-instance (use Upstash Redis for global enforcement).
* TTS voices are standard neural voices; cloning premium child voices requires a
  paid provider (ElevenLabs/Fish Audio) behind the same `SpeechSynthesizer` interface.
* No institution multi-teacher management UI yet (schema supports it).
* Password reset email requires a configured Resend domain in production.

---

© Fitna AI — production rebuild. Licensed for the project owner.
