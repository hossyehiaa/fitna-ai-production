# Fitna AI (فِطنة) — Comprehensive Project Report

**Date:** September 2026  
**Project:** Fitna AI (فِطنة) — AI-Powered Classroom Simulation for Teacher Training  
**Version:** 0.1.0 (Milestones 1–7 Completed)  
**Platform:** Next.js 16 (App Router) + React 19 + TypeScript + Supabase + Groq + ElevenLabs  

---

## 1. Executive Summary

**Fitna AI (فِطنة)** is an intelligent, voice-driven classroom simulation and pedagogical training platform designed for K-12 educators. It provides teachers with a safe, realistic virtual classroom environment where they can practice teaching lessons and engage in natural spoken Arabic dialogue with an AI-driven student swarm representing real Egyptian primary school student personas (Omar, Sara, Yassin, and Nour).

The platform tracks and evaluates teacher pedagogical performance in real time (via a live classroom Heads-Up Display), provides evidence-grounded post-session diagnostic reports, and compiles progress into a longitudinal teacher Growth Portfolio.

---

## 2. End-to-End System Architecture

```
+-------------------------------------------------------------------------------+
|                             TEACHER CLIENT (Browser)                          |
|  - Real-time Audio Capture (Push-to-Talk / Open-Mic VAD)                      |
|  - Live Pedagogical HUD (Teacher Talk Ratio, Socratic Rate, Inclusivity Index)|
|  - Interactive 4-Student Classroom Avatars (Attention & Emotion States)       |
|  - Web Audio API playback for streaming student voice responses               |
+-------------------------------------------------------------------------------+
                                      |
              (WebM / Audio Blob)     |     (Audio Stream & Turn JSON)
                                      v
+-------------------------------------------------------------------------------+
|                             NEXT.JS APP SERVER                                |
|  - Route Handlers (/api/stt, /api/sessions/[id]/turn, /api/tts, /api/end)    |
|  - 3-Layer Role Isolation & Route Middleware (proxy.ts)                       |
|  - Server-side Session & Transcript Management                                |
+-------------------------------------------------------------------------------+
      |                                |                               |
      v                                v                               v
+------------------+         +---------------------+        +--------------------+
|    GROQ STT      |         |   GROQ LLM SWARM    |        |  ELEVENLABS TTS    |
| Whisper-large-v3 |         | gpt-oss-120b / 20b  |        | Multilingual v2    |
| Arabic Egyptian  |         | Classroom Swarm &   |        | Egyptian Youth     |
| Transcription    |         | Pedagogy Classifier |        | Child Personas     |
+------------------+         +---------------------+        +--------------------+
                                       |
                                       v
                     +-----------------------------------+
                     |       SUPABASE INFRASTRUCTURE     |
                     |  - PostgreSQL 15 Database         |
                     |  - Row-Level Security (RLS)       |
                     |  - Auth & Cookie-based Sessions   |
                     |  - Events, Transcripts & Reports  |
                     +-----------------------------------+
```

---

## 3. Milestones Overview: What Has Been Built (Milestones 1 – 7)

### Milestone 1: Authentication, Multi-Tenancy & 3-Layer Role Isolation
* **Supabase Authentication**: Secure user registration, sign-in, session management with HTTP-only cookies (`@supabase/ssr`), and a complete password reset recovery flow (`/auth/confirm` and `/reset-password`).
* **3-Layer Role Isolation (Teacher vs. Institution Admin)**:
  1. **Next.js Proxy/Middleware (`src/proxy.ts`)**: Rejects unauthenticated requests and redirects cross-role access before routes render.
  2. **Postgres Row-Level Security (RLS)**: Enforces multi-tenant data isolation at the database engine level so no institution or teacher can access unauthorized rows.
  3. **Server-Side Identity Binding**: All queries filter strictly by server-verified `auth.uid()`, preventing client-side ID tampering.
* **Dual Dashboards**:
  * `/dashboard/teacher`: Personal performance metrics, recent sessions, and quick actions.
  * `/dashboard/institution`: Aggregate school metrics, teacher rosters, and institutional performance indicators.

### Milestone 2: Curriculum Ingestion & Session Setup
* **Curriculum & Lesson Ingestion (`/session/setup`)**:
  * Topic selection with dynamic database expansion (`POST /api/lesson-topics/create`).
  * Real PDF syllabus ingestion: Extracted server-side via `pdf-parse` v2 (using Next.js external bundling).
  * Manual lesson summary fallback option.
* **Simulation Configuration**: Custom duration selector (10 to 30 minutes) and classroom style selection (Balanced, Inquisitive, Easily Distracted).
* **Live Student Persona Previews**: Dynamic inspection cards for the 4 student personas detailing their base traits and attention baselines.

### Milestone 3 & 4: Live Simulation Room & Real-Time Pedagogical HUD
* **Voice-First Classroom Interaction (`/session/live/[id]`)**:
  * **Dual Mic Capture**: Flexible "Push-to-Talk" (Spacebar / Click) and "Open-Mic" (Zoom style with voice activity detection).
  * **Fast Egyptian STT**: Real-time Arabic speech transcription powered by **Groq Whisper Large-v3**.
  * **Dynamic Multi-Persona Swarm**:
    * 4 distinct student personas:
      * **Omar (10 yrs)**: Energetic, sports lover, competitive in mental math.
      * **Sara (10 yrs)**: Attentive, polite, enthusiastic about reading and art.
      * **Yassin (9 yrs)**: Spontaneous, witty, loves video games and playful jokes.
      * **Nour (10 yrs)**: Gentle, observant, organized, takes diligent notes.
    * Real-time student attention shifts and interactive states (`attentive`, `hand_raised`, `distracted`).
  * **Natural TTS Playback**: Integrated with **ElevenLabs Multilingual v2** using dedicated youth voice profiles, supported by Edge-TTS fallbacks.
* **Live Pedagogical HUD (Heads-Up Display)**:
  * **Teacher Talk Ratio (TTR)**: Real-time speaking time percentage vs. student speaking time.
  * **Socratic Question Rate (SQR)**: Continuous classification of teacher questions into Open (Socratic) vs. Closed vs. Management statements.
  * **Inclusivity Index (II)**: Mathematical equity score (Shannon-entropy / Gini-based distribution) measuring whether all students are given equal speaking opportunities.

### Milestone 5: Diagnostic AI Report & Grounded Evidence Moments
* **Automated Post-Session Diagnostic (`/report/[id]`)**:
  * Triggered immediately upon session completion (`POST /api/sessions/[id]/end`).
  * **Session Signal (إشارة الجلسة)**: Executive one-liner capturing the primary pedagogical takeaway.
  * **Performance Narrative**: Contextual assessment generated by Groq LLM analyzing the entire session transcript.
  * **Interactive Evidence Moments**: AI identifies key moments in the session (e.g., great open question, student disengagement) mapped to exact timestamps. Clicking an evidence card instantly scrolls and highlights the specific line in the transcript.
  * **Safety Net**: One-click report regeneration (`/report/regenerate`) in case of network disruptions.

### Milestone 6: Settings, Profile & Zero-Flicker Dark Mode
* **Account Settings (`/settings`)**:
  * Teacher profile management: Teaching experience, grade level, subjects, and training objectives.
  * Email update and password modification workflows.
* **True Zero-Flicker Dark Mode**:
  * Cookie-backed SSR theme resolution preventing client-side layout flashing.
  * Native Tailwind CSS v4 styling with high-contrast, dark-navy classroom aesthetic.

### Milestone 7: Growth Portfolio, History & Bilingual Support (AR / EN)
* **Simulation History (`/history`)**: Paginated archive of all past completed simulations with metric breakdowns and search/filtering capabilities.
* **Growth Portfolio (`/growth`)**:
  * **SVG Trend Chart**: Interactive historical trajectory across past sessions without external heavyweight charting libraries.
  * **Per-Skill Breakdown**: Separate tracking for Socratic questioning, talk balance, student engagement, and overall score.
  * **Pedagogical Badges**: Dynamic achievement system (e.g., "Socrates Incarnate" awarded when Socratic inquiry exceeds 80%).
* **Bilingual Localization (English & Egyptian Arabic)**:
  * Full bidirectional i18n engine (`useTranslation()`) supporting seamless LTR and RTL interface layouts.

---

## 4. Key Architectural Breakthroughs & Recent Refactorings

1. **Elimination of Brittle Regex & Hardcoded Fallbacks:**
   * Transitioned from rigid regular expressions to a **General-Purpose LLM Swarm Prompt**. The model now contextually infers teacher gender, title, and speech corrections directly from conversational context.
2. **Authentic Egyptian Schoolchildren Dialect:**
   * Enforced strict dialect rules eliminating formal Modern Standard Arabic (MSA) phrasing (*"أعتذر"*, *"نعرف"*, *"كرة القدم"*) in favor of natural Egyptian colloquial speech (*"يا ميس"*, *"الكورة"*, *"معلش حقك علينا"*), ensuring ElevenLabs synthesizes authentic Egyptian child audio.
3. **High-Availability Multi-Model Failover:**
   * Implemented automatic model fallback rotation across `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, and `openai/gpt-oss-20b` to prevent any simulation downtime during Groq rate limits or deprecations.

---

## 5. Technology Stack Summary

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | Next.js 16 (App Router) + React 19 | High-performance Server Components & Route Handlers |
| **Language & Styling** | TypeScript 5 + Tailwind CSS v4 | Strongly typed architecture with responsive modern design |
| **Database & Auth** | Supabase (PostgreSQL 15 + RLS) | Authentication, session persistence, and multi-tenant security |
| **Speech-to-Text (STT)** | Groq Whisper Large-v3 | Sub-second spoken Arabic speech-to-text |
| **Text-to-Speech (TTS)** | ElevenLabs Multilingual v2 | Expressive Egyptian child persona voices |
| **Orchestration LLM** | Groq (`gpt-oss-120b`, `qwen`, `gpt-oss-20b`) | Multi-agent student simulation & pedagogical analysis |
| **Document Parsing** | `pdf-parse` v2 | Server-side syllabus & curriculum text extraction |

---

## 6. Project Verification & Quality Assurance

* **TypeScript Compilation**: `npx tsc --noEmit` verifies 100% type-safe codebase with 0 errors.
* **Runtime Reliability**: Protected with top-level try/catch blocks across all API endpoints, defensive JSON parsing, and graceful fallback behaviors.
