// =====================================================================
// Input validation — zod schemas shared by API routes.
// All client input is validated server-side; nothing is trusted.
// =====================================================================

import { z } from 'zod'
import { DIALECTS } from '@/lib/dialect/config'

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'البريد الإلكتروني قصير جداً')
  .max(254, 'البريد الإلكتروني طويل جداً')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'صيغة البريد الإلكتروني غير صحيحة')

const password = z
  .string()
  .min(8, 'كلمة المرور يجب أن تتكون من 8 أحرف على الأقل')
  .max(128, 'كلمة المرور طويلة جداً')
  .regex(/[A-Za-z\u0600-\u06FF]/, 'كلمة المرور يجب أن تحتوي على حرف واحد على الأقل')
  .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على رقم واحد على الأقل')

const fullName = z
  .string()
  .trim()
  .min(2, 'الاسم قصير جداً')
  .max(80, 'الاسم طويل جداً')
  .regex(/^[\u0600-\u06FF\u0750-\u077FA-Za-z\s.'-]+$/, 'الاسم يحتوي على رموز غير مسموح بها')

export const signupSchema = z
  .object({
    email,
    password,
    fullName,
    /** teacher | institution — stored as the authoritative role */
    userType: z.enum(['teacher', 'institution']),
    /** saudi | egyptian — speech/AI dialect profile (never changes UI language) */
    dialect: z.enum(DIALECTS),
    institutionName: z.string().trim().max(120).optional().or(z.literal('')),
  })
  .refine((v) => v.userType !== 'institution' || (v.institutionName && v.institutionName.length >= 2), {
    message: 'اسم المؤسسة مطلوب لحسابات المؤسسات',
    path: ['institutionName'],
  })

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'كلمة المرور مطلوبة').max(128),
})

export const forgotPasswordSchema = z.object({ email })

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password,
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'كلمة المرور الحالية مطلوبة').max(128),
  newPassword: password,
})

export const updateProfileSchema = z.object({
  fullName,
  dialect: z.enum(DIALECTS).optional(),
  institutionName: z.string().trim().max(120).optional().or(z.literal('')),
})

export const speechSettingsSchema = z.object({
  ttsVoice: z.string().trim().max(60).optional().or(z.literal('')),
  ttsRate: z
    .string()
    .regex(/^[+-]\d{1,3}%$/, 'قيمة السرعة غير صالحة')
    .optional(),
  ttsPitch: z
    .string()
    .regex(/^[+-]\d{1,3}Hz$/, 'قيمة النبرة غير صالحة')
    .optional(),
  speakingRate: z.number().min(0.5).max(1.5).optional(),
  expressiveness: z.enum(['relaxed', 'balanced', 'expressive']).optional(),
})

export const createSessionSchema = z.object({
  topicId: z.string().max(50).optional().or(z.literal('')),
  lessonContext: z.string().trim().max(4000).optional().or(z.literal('')),
  durationMinutes: z.number().int().min(5).max(60).default(15),
  classroomStyle: z.enum(['balanced', 'disruptive', 'disengaged']).default('balanced'),
  trainingObjective: z
    .enum(['socratic_focus', 'talk_time_reduction', 'inclusive_engagement', 'behavior_redirection'])
    .default('socratic_focus'),
})

export const turnSchema = z.object({
  teacherText: z.string().trim().min(1, 'لا يوجد نص منطوق').max(2000),
  elapsedMs: z.number().int().min(0).max(3_600_000).default(0),
  speechDurationMs: z.number().int().min(0).max(600_000).default(0),
})

export const endSessionSchema = z.object({
  reason: z.enum(['completed', 'abandoned']).default('completed'),
})

export const ttsRequestSchema = z.object({
  text: z.string().trim().min(1, 'لا يوجد نص للنطق').max(1000),
  agentKey: z.string().trim().max(40).optional(),
  /** Preview/testing only — real conversations always use the profile dialect */
  previewDialect: z.enum(DIALECTS).optional(),
  rate: z
    .string()
    .regex(/^[+-]\d{1,3}%$/)
    .optional(),
  pitch: z
    .string()
    .regex(/^[+-]\d{1,3}Hz$/)
    .optional(),
})

/** Convert a ZodError into a single Arabic user-facing message. */
export function firstZodError(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue?.message || 'البيانات المُرسلة غير صالحة'
}

/** Safely parse JSON with a size limit. */
export async function safeJson<T>(
  req: Request,
  schema: z.ZodType<T>,
  maxBytes = 100_000
): Promise<{ data: T } | { error: string }> {
  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    return { error: 'حجم الطلب أكبر من الحد المسموح به' }
  }
  let body: unknown
  try {
    const text = await req.text()
    if (text.length > maxBytes) return { error: 'حجم الطلب أكبر من الحد المسموح به' }
    body = JSON.parse(text)
  } catch {
    return { error: 'صيغة الطلب غير صالحة' }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return { error: firstZodError(parsed.error) }
  }
  return { data: parsed.data }
}
