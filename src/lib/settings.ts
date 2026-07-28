import type { SupabaseClient } from "@supabase/supabase-js";

export type Theme = "dark" | "light" | "system";
export type Language = "en" | "bn";

export interface StudentSettings {
  theme: Theme;
  language: Language;
  show_on_leaderboard: boolean;
  share_progress_with_friends: boolean;
  ai_reminder_notifications: boolean;
  daily_mission_notifications: boolean;
  friend_activity_notifications: boolean;
}

export const DEFAULT_SETTINGS: StudentSettings = {
  theme: "dark",
  language: "en",
  show_on_leaderboard: true,
  share_progress_with_friends: false,
  ai_reminder_notifications: true,
  daily_mission_notifications: true,
  // Friend Activity has no feed to notify about yet (no friends feature
  // shipped) — the toggle exists so the preference is captured now and the
  // Friends work can wire into it later without a Settings UI change.
  friend_activity_notifications: true,
};

export const THEME_LABELS: Record<Theme, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  bn: "বাংলা",
};

/** Reads a student's settings row, creating the default row on first access. */
export async function getSettings(
  supabase: SupabaseClient,
  studentId: string
): Promise<StudentSettings> {
  const { data } = await supabase
    .from("student_settings")
    .select(
      "theme, language, show_on_leaderboard, share_progress_with_friends, ai_reminder_notifications, daily_mission_notifications, friend_activity_notifications"
    )
    .eq("student_id", studentId)
    .maybeSingle();

  if (data) return data as StudentSettings;

  // No row yet — create one with defaults so future writes are updates, not upserts.
  await supabase.from("student_settings").upsert({ student_id: studentId, ...DEFAULT_SETTINGS });
  return DEFAULT_SETTINGS;
}
