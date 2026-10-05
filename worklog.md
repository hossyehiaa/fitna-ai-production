# Fitna AI Production Rebuild — Work Log

---
Task ID: 1
Agent: Super Z (main agent)
Task: Full production rebuild of Fitna AI — audit source repo, rebuild with security/localization architecture, deploy to GitHub + Vercel + Neon.

Work Log:
- Audited source repo mariamhisham24/Fitna-ai (395 files, Next.js 16 + Supabase + Groq + 4-tier TTS waterfall). Found CRITICAL: hardcoded Supabase service_role key in src/lib/supabase/{server,client}.ts + proxy.ts; Egyptian-Arabic UI strings violating MSA requirement; no rate limiting.
- Verified credentials: GitHub (hossyehiaa), Vercel (hassanyehia500-2241, hobby), Neon DB TCP+SSL OK.
- Initialized fullstack env; installed msedge-tts + groq-sdk.
- Prisma schema (11 models: users/profiles/auth_sessions/password_reset_tokens/agents/lesson_topics/sim_sessions/session_events/reports/badges/speech_settings/audit_logs) → migration applied to Neon (20261005144506_init_production_schema).
- Built security foundation: scrypt passwords, opaque DB sessions (HMAC-hashed tokens, HttpOnly cookies), CSRF triple-check (SameSite + Origin + X-Requested-With), per-route rate limiting, zod validation everywhere, audit logging with IP hashing, CSP/HSTS security headers via middleware.
- Dialect architecture: src/lib/dialect/config.ts (saudi/egyptian) → STT locale+bias, agent prompt block, TTS voice mapping (ar-SA-Hamed/Zariyah, ar-EG-Salma/Shakir). UI stays MSA in both.
- AI layer: Groq llama-3.3-70b with prompt-injection fencing (user speech as data fence) + deterministic dialect-aware fallback engine (works without any API key).
- TTS: msedge-tts v2 API (fixed toStream→{audioStream}); STT: Groq Whisper with dialect bias prompts.
- Full MSA RTL UI: landing, login, 4-step signup wizard, dashboard, session setup, live classroom (mic + text fallback), report, history, settings (profile/voice+dialect/security).
- E2E test suite (scripts/e2e_test.py): 40/40 locally, 39/40 production (rate-limit spread across serverless instances — documented limitation).
- Browser E2E via agent-browser: full journey signup→dashboard→live room→report→history→settings, both local and production. Saudi user got Saudi-dialect reactions ("مو متأكد"، "يا أستاذ"), Egyptian user got Egyptian ("مش متأكد"، "يا مستر").
- Fixed: turn route.ts lost due to bash brace-literal mkdir ({} quoted) — recreated; nested Prisma upsert sessionId error — split into separate upsert; msedge-tts v2 API signature; audit.ts Prisma JSON types; SettingsTabs missing </TabsList>; ThemeToggle setState-in-effect → useSyncExternalStore.
- Production build clean (tsc + next build, all 24 routes).
- GitHub repo created: hossyehiaa/fitna-ai-production (4 commits, 129 files, full-history secret scan CLEAN).
- Vercel: project fitna-ai-production, env vars set via API (DATABASE_URL/AUTH_SECRET encrypted), deployed via CLI → https://fitna-ai-production.vercel.app (health: ok, DB up).
- Final security audit: security headers verified, JS bundle secret scan clean, unauthenticated API → 401, git history clean, /.env → 404.

Stage Summary:
- Production URL: https://fitna-ai-production.vercel.app (VERIFIED working end-to-end)
- Repo: https://github.com/hossyehiaa/fitna-ai-production
- Secrets rotated: AUTH_SECRET generated fresh; user-supplied GitHub/Vercel/Neon credentials treated as COMPROMISED (exposed in chat) — user MUST rotate all three.
- GROQ_API_KEY not provided → AI runs deterministic fallback engine + STT returns graceful Arabic error with text-input fallback. User can add the key in Vercel env vars for full LLM+STT mode.

---
Task ID: 2
Agent: Super Z (main agent)
Task: Real production AI pipeline — Groq LLM (user-provided key) + Fish Audio TTS (user-provided key), full test matrix, redeploy, production verification.

Work Log:
- Stored GROQ_API_KEY + FISH_AUDIO_API_KEY in .env only (gitignored, verified). Set TTS_PROVIDER=fish. .env.example + README updated (template values only).
- Groq connectivity: sandbox egress is HKG — Groq region-blocks ALL requests there (403 Forbidden for valid/invalid/missing keys alike). Verified key VALID from Vercel US egress.
- Fish Audio connectivity: key authenticates, but account has ZERO API credit → all TTS calls 402 ("API credit is managed independently from platform credit"). Scanned public Arabic voice library (language=ar, 1020 voices) and selected 6 gender-matched young voices (Asmaa/Yee/صوت بنت/غامبول/العم فخم/روبن).
- Implemented src/lib/speech/fish-audio.ts: SpeechSynthesizer provider (speech-1.5, reference_id per dialect×agent, 15s AbortController timeout, typed TTSError codes incl. insufficient_credit). voiceUsed surfaces as fish:<refid8>.
- Rewired tts.ts: chainedSynthesizer(fish → msedge); TTSError moved to provider.ts contract; TTS_PROVIDER=msedge forces Edge only.
- Health route reports provider flags only: tts=fish-audio(+msedge fallback), stt=groq-whisper, ai=groq-gpt-oss-120b.
- Local E2E: 40/40. Fallback chains verified live: Groq 403→deterministic engine (Egyptian dialect preserved); Fish 402→msedge (MP3 delivered). Browser live-room journey: login→2 turns→report, TTS POST 200.
- Production deploy #1: Groq 404 "model llama-3.3-70b-versatile does not exist" — key valid, model unavailable. Added temp /api/groq-models diag → available: openai/gpt-oss-120b, qwen/qwen3.8-27b, allam-2-7b, whisper-large-v3(+turbo), orpheus models, prompt-guard classifiers.
- Rewrote groq.ts: model chain [GROQ_CHAT_MODEL → gpt-oss-120b (reasoning_effort low) → qwen3.8-27b → allam-2-7b]; 404 walks chain, other errors fail fast to fallback.
- First real-Groq prod test: provider=groq but dialect leakage (Saudi said علشان/يخلّي; Egyptian said سوا). Strengthened dialect agentInstructions with USE-vocabulary banks + example replies + hard forbidden-word lists; swarm prompt dialect enforcement line.
- Final production verification: Saudi PASS (groq, 6 markers, ar-SA voices, MP3, report), Egyptian PASS (groq, 7 markers, ar-EG voices, MP3, report). Whisper STT PASS (12/13-word Arabic transcription match from real audio). Production E2E 39/40 (single miss = documented serverless rate-limit spread; limiter proven live by 429s). Browser E2E on production: login→live room→real Groq Egyptian reactions→TTS 200→report 62/100.
- Security: temp diag route REMOVED (404 confirmed); full git history scan CLEAN (7 commits); production HTML+11 JS chunks scanned CLEAN (no secret values, no server env names); CSRF/IDOR/auth re-verified via E2E; secrets never printed in logs/tests/report.
- Committed 2c5b24a + 9a97cdb; pushed to github.com/hossyehiaa/fitna-ai-production.

Stage Summary:
- Production URL: https://fitna-ai-production.vercel.app (health ok; ai=groq-gpt-oss-120b; tts=fish-audio+msedge; stt=groq-whisper; db up)
- REAL AI pipeline live: Groq generates dialect-authentic student reactions; Whisper STT transcribes Arabic; Fish Audio is primary TTS but the account needs API credit (402) — until topped up at fish.audio/app/developers the chain transparently serves Edge neural voices (sessions never break).
- All user-supplied credentials (GitHub/Vercel/Neon/Groq/Fish) were pasted in chat → treat as COMPROMISED, rotate after adoption.
- Known limitations: (1) Fish Audio 402 until user adds API credit; (2) sandbox cannot reach Groq directly (HKG region block) — Groq tests must run via Vercel; (3) serverless in-memory rate limiting spreads across instances (39/40 E2E).
