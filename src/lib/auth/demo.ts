import type { User } from '@supabase/supabase-js';

export const DEMO_USER_ID = 'd3300000-0000-4000-8000-000000000001';
export const DEMO_USER_EMAIL = 'demo@fitna.ai';
export const DEMO_USER_NAME = 'معلم تجريبي (Demo Teacher)';
export const DEMO_COOKIE_NAME = 'fitna_demo';

export const DEMO_USER: User = {
  id: DEMO_USER_ID,
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { role: 'teacher', full_name: DEMO_USER_NAME },
  aud: 'authenticated',
  confirmation_sent_at: '2026-09-20T00:00:00.000Z',
  recovery_sent_at: undefined,
  email_change_sent_at: undefined,
  new_email: undefined,
  invited_at: undefined,
  action_link: undefined,
  email: DEMO_USER_EMAIL,
  phone: '',
  created_at: '2026-09-20T00:00:00.000Z',
  confirmed_at: '2026-09-20T00:00:00.000Z',
  email_confirmed_at: '2026-09-20T00:00:00.000Z',
  phone_confirmed_at: undefined,
  last_sign_in_at: '2026-09-20T00:00:00.000Z',
  role: 'authenticated',
  updated_at: '2026-09-20T00:00:00.000Z',
  identities: [],
  is_anonymous: false,
};

export const DEMO_PROFILE = {
  id: DEMO_USER_ID,
  email: DEMO_USER_EMAIL,
  role: 'teacher' as const,
  full_name: DEMO_USER_NAME,
  institution_id: null,
  preferred_theme: 'dark' as const,
  preferred_language: 'ar' as const,
  teaching_experience: '5-10',
  teaching_level: 'primary',
  subject: 'Science & English',
  created_at: '2026-09-20T00:00:00.000Z',
  updated_at: '2026-09-20T00:00:00.000Z',
};
