-- =====================================================================
-- Fitna AI — Database schema + Row Level Security policies
--
-- HOW TO APPLY:
--   1. Open your Supabase project → SQL Editor
--   2. Paste this entire file, click "Run"
--   3. It's idempotent-ish (uses IF NOT EXISTS / drop-then-create for
--      policies) so it's safe to re-run while iterating.
--
-- This is the enforcement layer described in spec section 2.1:
-- even if a bug in the frontend or a tampered request tries to read
-- another teacher's data, Postgres itself refuses the row.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null check (role in ('teacher', 'institution_admin', 'super_admin')),
  institution_id uuid references public.institutions(id) on delete set null,
  preferred_language text not null default 'ar' check (preferred_language in ('ar','en')),
  preferred_theme text not null default 'light' check (preferred_theme in ('light','dark')),
  -- Profile fields (spec FR-04/FR-05: profile + onboarding).
  teaching_experience text, -- e.g. '0-2', '3-5', '6-10', '10+'
  teaching_level text,      -- e.g. 'ابتدائي', 'إعدادي', 'ثانوي'
  subject text,             -- e.g. 'لغة عربية', 'رياضيات', ...
  training_goals text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Migration: add profile columns to an already-existing `users` table.
-- `CREATE TABLE IF NOT EXISTS` above does nothing if the table already
-- exists (which it does, from Milestone 1) — these ALTER statements are
-- what actually add the new columns when re-running this file.
-- ---------------------------------------------------------------------
alter table public.users add column if not exists teaching_experience text;
alter table public.users add column if not exists teaching_level text;
alter table public.users add column if not exists subject text;
alter table public.users add column if not exists training_goals text[] not null default '{}';

create table if not exists public.lesson_topics (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null,
  title_en text,
  institution_id uuid references public.institutions(id) on delete cascade, -- null = global default topic
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.student_personas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  age int not null,
  dialect text not null default 'egyptian_arabic',
  personality_prompt text not null,
  base_attention int not null default 70 check (base_attention between 0 and 100),
  strengths text[] not null default '{}',
  weaknesses text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.users(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete set null,
  topic_id uuid references public.lesson_topics(id) on delete set null,
  lesson_context text,
  duration_minutes int not null default 15,
  classroom_style text default 'balanced' check (classroom_style in ('balanced','disruptive','disengaged')),
  training_objective text default 'socratic_focus' check (training_objective in ('socratic_focus','talk_time_reduction','inclusive_engagement','behavior_redirection')),
  status text not null default 'in_progress' check (status in ('in_progress','completed','abandoned')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  overall_score numeric(5,2),
  teacher_talk_ratio numeric(5,2),
  socratic_question_rate numeric(5,2),
  inclusivity_index numeric(5,2),
  classroom_pattern text check (classroom_pattern in ('balanced','disruptive','disengaged'))
);

alter table public.sessions add column if not exists classroom_style text default 'balanced';
alter table public.sessions add column if not exists training_objective text default 'socratic_focus';


create table if not exists public.session_students (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  persona_id uuid not null references public.student_personas(id) on delete restrict,
  final_attention int,
  times_spoken int not null default 0
);

create table if not exists public.session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  event_type text not null,
  actor text not null,
  content text not null,
  audio_url text,
  metadata jsonb,
  occurred_at_ms int not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  summary_ar text not null,
  session_signal_ar text not null,
  strengths text[] not null default '{}',
  weaknesses text[] not null default '{}',
  recommendations text[] not null default '{}',
  evidence_moments jsonb not null default '[]',
  framework_scores jsonb default null,
  share_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Migration: add strengths/weaknesses and framework_scores to reports table
alter table public.reports add column if not exists strengths text[] not null default '{}';
alter table public.reports add column if not exists weaknesses text[] not null default '{}';
alter table public.reports add column if not exists framework_scores jsonb default null;


create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  badge_key text not null,
  unlocked_at timestamptz not null default now(),
  session_id uuid references public.sessions(id) on delete set null,
  unique (user_id, badge_key)
);

create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.cohort_members (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  teacher_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (cohort_id, teacher_id)
);

create index if not exists idx_sessions_teacher on public.sessions(teacher_id);
create index if not exists idx_sessions_institution on public.sessions(institution_id);
create index if not exists idx_session_events_session on public.session_events(session_id, occurred_at_ms);
create index if not exists idx_users_institution on public.users(institution_id);
create index if not exists idx_cohorts_institution on public.cohorts(institution_id);
create index if not exists idx_cohort_members_cohort on public.cohort_members(cohort_id);

-- ---------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so policies can look up the
-- caller's own role/institution without recursive RLS on `users`)
-- ---------------------------------------------------------------------

create or replace function public.current_role()
returns text
language sql security definer stable
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.current_institution_id()
returns uuid
language sql security definer stable
as $$
  select institution_id from public.users where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------
alter table public.institutions enable row level security;
alter table public.users enable row level security;
alter table public.lesson_topics enable row level security;
alter table public.student_personas enable row level security;
alter table public.sessions enable row level security;
alter table public.session_students enable row level security;
alter table public.session_events enable row level security;
alter table public.reports enable row level security;
alter table public.badges enable row level security;
alter table public.cohorts enable row level security;
alter table public.cohort_members enable row level security;

-- Policies: cohorts / cohort_members
drop policy if exists "cohorts_select_institution" on public.cohorts;
create policy "cohorts_select_institution" on public.cohorts
  for select using (institution_id = public.current_institution_id());

drop policy if exists "cohorts_write_institution_admin" on public.cohorts;
create policy "cohorts_write_institution_admin" on public.cohorts
  for all using (
    public.current_role() = 'institution_admin'
    and institution_id = public.current_institution_id()
  );

drop policy if exists "cohort_members_select_institution" on public.cohort_members;
create policy "cohort_members_select_institution" on public.cohort_members
  for select using (
    exists (
      select 1 from public.cohorts c
      where c.id = cohort_members.cohort_id
        and c.institution_id = public.current_institution_id()
    )
  );

drop policy if exists "cohort_members_write_institution_admin" on public.cohort_members;
create policy "cohort_members_write_institution_admin" on public.cohort_members
  for all using (
    public.current_role() = 'institution_admin'
    and exists (
      select 1 from public.cohorts c
      where c.id = cohort_members.cohort_id
        and c.institution_id = public.current_institution_id()
    )
  );


-- ---------------------------------------------------------------------
-- Policies: users
-- A user can read/update their own row.
-- An institution_admin can read (not write) users belonging to their
-- own institution — needed for the Institution Dashboard teacher table.
-- ---------------------------------------------------------------------
drop policy if exists "users_select_self" on public.users;
create policy "users_select_self" on public.users
  for select using (id = auth.uid());

drop policy if exists "users_select_same_institution_admin" on public.users;
create policy "users_select_same_institution_admin" on public.users
  for select using (
    public.current_role() = 'institution_admin'
    and institution_id = public.current_institution_id()
  );

drop policy if exists "users_update_self" on public.users;
create policy "users_update_self" on public.users
  for update using (id = auth.uid());

drop policy if exists "users_insert_self" on public.users;
create policy "users_insert_self" on public.users
  for insert with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- Policies: institutions
-- Members can read their own institution's row only.
-- ---------------------------------------------------------------------
drop policy if exists "institutions_select_own" on public.institutions;
create policy "institutions_select_own" on public.institutions
  for select using (id = public.current_institution_id());

-- ---------------------------------------------------------------------
-- Policies: lesson_topics
-- Everyone can read global topics (institution_id is null) plus their
-- own institution's custom topics. Both institution_admin AND teacher
-- can write — a teacher adding a topic they need mid-setup (spec Stage
-- 5: the topic list "لازم تقدر تتوسع ديناميكيًا") is scoped to their
-- own institution_id (or NULL if they have none), same as an admin's.
-- ---------------------------------------------------------------------
drop policy if exists "topics_select" on public.lesson_topics;
create policy "topics_select" on public.lesson_topics
  for select using (
    institution_id is null
    or institution_id = public.current_institution_id()
  );

drop policy if exists "topics_write_admin" on public.lesson_topics;
drop policy if exists "topics_write" on public.lesson_topics;
create policy "topics_write" on public.lesson_topics
  for insert with check (
    (public.current_role() = 'institution_admin' and institution_id = public.current_institution_id())
    or (public.current_role() = 'teacher' and institution_id is not distinct from public.current_institution_id())
  );

-- ---------------------------------------------------------------------
-- Policies: student_personas
-- Read-only shared reference data for every authenticated user.
-- ---------------------------------------------------------------------
drop policy if exists "personas_select_all" on public.student_personas;
create policy "personas_select_all" on public.student_personas
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- Policies: sessions
-- A teacher sees/writes only their own sessions.
-- An institution_admin sees (read-only) sessions of teachers in their
-- own institution — never writes, never starts a session as admin
-- (enforced again at the application layer in session setup).
-- ---------------------------------------------------------------------
drop policy if exists "sessions_all_own_teacher" on public.sessions;
create policy "sessions_all_own_teacher" on public.sessions
  for all using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

drop policy if exists "sessions_select_institution_admin" on public.sessions;
create policy "sessions_select_institution_admin" on public.sessions
  for select using (
    public.current_role() = 'institution_admin'
    and institution_id = public.current_institution_id()
  );

-- ---------------------------------------------------------------------
-- Policies: session_students / session_events / reports
-- Access follows the parent session: visible only if the caller can
-- already see that session (teacher-owner or same-institution admin).
-- ---------------------------------------------------------------------
drop policy if exists "session_students_via_session" on public.session_students;
create policy "session_students_via_session" on public.session_students
  for all using (
    exists (
      select 1 from public.sessions s
      where s.id = session_students.session_id
        and (
          s.teacher_id = auth.uid()
          or (public.current_role() = 'institution_admin' and s.institution_id = public.current_institution_id())
        )
    )
  );

drop policy if exists "session_events_via_session" on public.session_events;
create policy "session_events_via_session" on public.session_events
  for all using (
    exists (
      select 1 from public.sessions s
      where s.id = session_events.session_id
        and (
          s.teacher_id = auth.uid()
          or (public.current_role() = 'institution_admin' and s.institution_id = public.current_institution_id())
        )
    )
  );

drop policy if exists "reports_via_session" on public.reports;
create policy "reports_via_session" on public.reports
  for all using (
    exists (
      select 1 from public.sessions s
      where s.id = reports.session_id
        and (
          s.teacher_id = auth.uid()
          or (public.current_role() = 'institution_admin' and s.institution_id = public.current_institution_id())
        )
    )
  );

-- Public read-only access for the "share report" feature: anyone with
-- the share_token (a hard-to-guess UUID) can read that ONE report via
-- an API route using the admin client server-side — NOT via direct
-- anon-key table access — so no additional anon SELECT policy is
-- added here. See src/app/api/reports/share/[token]/route.ts.

-- ---------------------------------------------------------------------
-- Policies: badges
-- A user reads their own badges. Institution admins can view badges
-- of teachers in their institution (read-only, for the growth profile
-- admin view).
-- ---------------------------------------------------------------------
drop policy if exists "badges_select_own" on public.badges;
create policy "badges_select_own" on public.badges
  for select using (user_id = auth.uid());

drop policy if exists "badges_select_institution_admin" on public.badges;
create policy "badges_select_institution_admin" on public.badges
  for select using (
    public.current_role() = 'institution_admin'
    and exists (
      select 1 from public.users u
      where u.id = badges.user_id and u.institution_id = public.current_institution_id()
    )
  );

-- ---------------------------------------------------------------------
-- Trigger: auto-create the public.users profile row the moment someone
-- signs up via Supabase Auth. Role + full_name come from the
-- `options.data` passed to supabase.auth.signUp() on the client
-- (see src/app/(auth)/login/actions.ts). This avoids a race condition
-- where the client tries to INSERT into public.users before it's sure
-- the auth session is fully established.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer
as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'teacher')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- Seed data: default global lesson topics (safe to re-run)
-- ---------------------------------------------------------------------
insert into public.lesson_topics (title_ar, title_en, institution_id)
select * from (values
  ('إدارة الصف', 'Classroom Management', null::uuid),
  ('الكسور والأعداد', 'Fractions and Numbers', null::uuid),
  ('القراءة النقدية', 'Critical Reading', null::uuid),
  ('العلوم والتجربة', 'Science and Experimentation', null::uuid)
) as v(title_ar, title_en, institution_id)
where not exists (select 1 from public.lesson_topics where title_ar = v.title_ar and institution_id is null);

-- ---------------------------------------------------------------------
-- Seed data: the four student personas (Omar, Sarah, Yassin, Nour)
-- ---------------------------------------------------------------------
insert into public.student_personas (name, age, dialect, personality_prompt, base_attention, strengths, weaknesses)
select * from (values
  (
    'عمر', 10, 'egyptian_arabic',
    'انت طفل مصري عمرك 10 سنين اسمك عمر. شخصيتك نشيط وفضولي بس بيتشتت بسرعة. بتتكلم باللهجة المصرية العامية زي طفل حقيقي (كلمات زي "بجد؟"، "يعني ايه"، "عايز أعرف"). بتحب تسأل أسئلة كتير بس مش دايمًا مركز.',
    75, array['فضول وحماس للمشاركة'], array['تشتت الانتباه بسرعة']
  ),
  (
    'سارة', 11, 'egyptian_arabic',
    'انتي طفلة مصرية عمرك 11 سنة اسمك سارة. شخصيتك هادية ومجتهدة وبتحب تجاوب صح بس بتخاف تتكلم قدام زمايلها لو مش متأكدة. بتتكلم باللهجة المصرية بأدب ("لو سمحت"، "ممكن أسأل").',
    85, array['دقة في الإجابات', 'التزام بالنقاش'], array['خجل من المشاركة التلقائية']
  ),
  (
    'ياسين', 9, 'egyptian_arabic',
    'انت طفل مصري عمرك 9 سنين اسمك ياسين. شخصيتك فيها شقاوة شوية وبتحب تلفت الانتباه، بتتكلم بصوت عالي شوية وبتقاطع أحيانًا. لهجة عامية جدًا ("ايه ده؟"، "مش عايز").',
    60, array['طاقة وحيوية'], array['مقاطعة الزملاء', 'صعوبة الانتظار لدوره']
  ),
  (
    'نور', 10, 'egyptian_arabic',
    'انتي طفلة مصرية عمرها 10 سنين اسمها نور. شخصيتك هادية جدًا ومنطوية، نادرًا ما ترفعي إيدك من غير تشجيع مباشر من المعلم. لما تتكلمي بتتكلمي بصوت هادي ولهجة مصرية بسيطة.',
    50, array['ملاحظة دقيقة لما تتكلم'], array['نادرًا ما تشارك من تلقاء نفسها']
  )
) as v(name, age, dialect, personality_prompt, base_attention, strengths, weaknesses)
where not exists (select 1 from public.student_personas where name = v.name);
