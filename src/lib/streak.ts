import type { SupabaseClient } from "@supabase/supabase-js";

const MILESTONES = [7, 14, 30] as const;

/** Returns YYYY-MM-DD for "today" in the student's own timezone. */
export function studentLocalDate(timezone: string, date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly what we store in `date` columns.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

/**
 * Call once a student finishes ALL 4 steps of today's mission.
 * Handles same-day idempotency, consecutive-day increments, streak breaks,
 * and milestone badge awards — all in the student's own timezone.
 */
export async function recordMissionCompletion(
  supabase: SupabaseClient,
  studentId: string,
  timezone: string
) {
  const today = studentLocalDate(timezone);

  const { data: existing, error: fetchError } = await supabase
    .from("streaks")
    .select("*")
    .eq("student_id", studentId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (!existing) {
    const row = {
      student_id: studentId,
      current_streak: 1,
      longest_streak: 1,
      last_completed_date: today,
      badges: [] as string[],
    };
    const { error } = await supabase.from("streaks").insert(row);
    if (error) throw error;
    return row;
  }

  if (existing.last_completed_date === today) {
    // Already completed today — idempotent, no double counting.
    return existing;
  }

  const gap = existing.last_completed_date ? daysBetween(existing.last_completed_date, today) : null;
  const newStreak = gap === 1 ? existing.current_streak + 1 : 1;
  const newLongest = Math.max(newStreak, existing.longest_streak);

  const newBadges = [...existing.badges];
  for (const milestone of MILESTONES) {
    const badgeKey = `${milestone}_day`;
    if (newStreak >= milestone && !newBadges.includes(badgeKey)) {
      newBadges.push(badgeKey);
    }
  }

  const updated = {
    current_streak: newStreak,
    longest_streak: newLongest,
    last_completed_date: today,
    badges: newBadges,
  };

  const { error } = await supabase.from("streaks").update(updated).eq("student_id", studentId);
  if (error) throw error;

  return { ...existing, ...updated };
}
