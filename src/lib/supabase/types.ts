/**
 * Hand-written types matching supabase/schema.sql.
 * Once the project is running, regenerate the authoritative version with:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts
 */

export type UserRole = "teacher" | "institution_admin" | "super_admin";
export type ThemePref = "light" | "dark";
export type LanguagePref = "ar" | "en";
export type ClassroomPattern = "balanced" | "disruptive" | "disengaged";
export type ClassroomStyle = "balanced" | "disruptive" | "disengaged";
export type TrainingObjective = "socratic_focus" | "talk_time_reduction" | "inclusive_engagement" | "behavior_redirection";
export type StudentState = "attentive" | "hand_raised" | "distracted";

export interface Database {
  public: {
    Tables: {
      institutions: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["institutions"]["Insert"]>;
        Relationships: [];
      };
      users: {
        Row: {
          id: string; // = auth.users.id
          email: string;
          full_name: string | null;
          role: UserRole;
          institution_id: string | null;
          preferred_language: LanguagePref;
          preferred_theme: ThemePref;
          teaching_experience: string | null;
          teaching_level: string | null;
          subject: string | null;
          training_goals: string[];
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role: UserRole;
          institution_id?: string | null;
          preferred_language?: LanguagePref;
          preferred_theme?: ThemePref;
          teaching_experience?: string | null;
          teaching_level?: string | null;
          subject?: string | null;
          training_goals?: string[];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      lesson_topics: {
        Row: {
          id: string;
          title_ar: string;
          title_en: string | null;
          institution_id: string | null; // null = global/default topic
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title_ar: string;
          title_en?: string | null;
          institution_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lesson_topics"]["Insert"]>;
        Relationships: [];
      };
      student_personas: {
        Row: {
          id: string;
          name: string;
          age: number;
          dialect: string;
          personality_prompt: string;
          base_attention: number; // 0-100
          strengths: string[];
          weaknesses: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          age: number;
          dialect?: string;
          personality_prompt: string;
          base_attention?: number;
          strengths?: string[];
          weaknesses?: string[];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["student_personas"]["Insert"]>;
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          teacher_id: string;
          institution_id: string | null;
          topic_id: string | null;
          lesson_context: string | null; // extracted PDF text or typed summary
          duration_minutes: number;
          classroom_style: ClassroomStyle | null;
          training_objective: TrainingObjective | null;
          status: "in_progress" | "completed" | "abandoned";
          started_at: string;
          ended_at: string | null;
          // computed metrics, null until session ends
          overall_score: number | null;
          teacher_talk_ratio: number | null;
          socratic_question_rate: number | null;
          inclusivity_index: number | null;
          classroom_pattern: ClassroomPattern | null;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          institution_id?: string | null;
          topic_id?: string | null;
          lesson_context?: string | null;
          duration_minutes: number;
          classroom_style?: ClassroomStyle | null;
          training_objective?: TrainingObjective | null;
          status?: "in_progress" | "completed" | "abandoned";
          started_at?: string;
          ended_at?: string | null;
          overall_score?: number | null;
          teacher_talk_ratio?: number | null;
          socratic_question_rate?: number | null;
          inclusivity_index?: number | null;
          classroom_pattern?: ClassroomPattern | null;
        };
        Update: Partial<Database["public"]["Tables"]["sessions"]["Insert"]>;
        Relationships: [];
      };
      session_students: {
        Row: {
          id: string;
          session_id: string;
          persona_id: string;
          final_attention: number | null;
          times_spoken: number;
        };
        Insert: {
          id?: string;
          session_id: string;
          persona_id: string;
          final_attention?: number | null;
          times_spoken?: number;
        };
        Update: Partial<Database["public"]["Tables"]["session_students"]["Insert"]>;
        Relationships: [];
      };
      session_events: {
        Row: {
          id: string;
          session_id: string;
          event_type: string; // "question_open" | "question_closed" | "student_response" | "redirect" | "ignored" | ...
          actor: string; // "teacher" | persona_id
          content: string;
          audio_url: string | null;
          metadata: Record<string, unknown> | null;
          occurred_at_ms: number; // ms since session start, for timeline playback
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          event_type: string;
          actor: string;
          content: string;
          audio_url?: string | null;
          metadata?: Record<string, unknown> | null;
          occurred_at_ms: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["session_events"]["Insert"]>;
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          session_id: string;
          summary_ar: string;
          session_signal_ar: string;
          strengths: string[];
          weaknesses: string[];
          recommendations: string[];
          evidence_moments: {
            label: string;
            timestamp_ms: number;
            event_id: string;
          }[];
          framework_scores: Record<string, unknown> | null;
          share_token: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          summary_ar: string;
          session_signal_ar: string;
          strengths?: string[];
          weaknesses?: string[];
          recommendations?: string[];
          evidence_moments?: {
            label: string;
            timestamp_ms: number;
            event_id: string;
          }[];
          framework_scores?: Record<string, unknown> | null;
          share_token?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reports"]["Insert"]>;
        Relationships: [];
      };
      badges: {
        Row: {
          id: string;
          user_id: string;
          badge_key: string;
          unlocked_at: string;
          session_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          badge_key: string;
          unlocked_at?: string;
          session_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["badges"]["Insert"]>;
        Relationships: [];
      };
      cohorts: {
        Row: {
          id: string;
          institution_id: string;
          name: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          institution_id: string;
          name: string;
          description?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cohorts"]["Insert"]>;
        Relationships: [];
      };
      cohort_members: {
        Row: {
          id: string;
          cohort_id: string;
          teacher_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          cohort_id: string;
          teacher_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cohort_members"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
