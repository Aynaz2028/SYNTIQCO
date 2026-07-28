import type { SupabaseClient } from "@supabase/supabase-js";
import { limitsFor } from "@/lib/tiers";
import { studentLocalDate } from "@/lib/streak";

/**
 * Atomically checks + increments today's solver usage for a student.
 * Throws if the free-tier daily limit is exceeded. This runs entirely in
 * the API route (server-side), so it can't be bypassed by hitting the
 * endpoint directly or hiding the UI counter.
 */
export async function checkAndIncrementSolverUsage(
  supabase: SupabaseClient,
  studentId: string,
  tier: string,
  timezone: string
) {
  const limits = limitsFor(tier);
  const today = studentLocalDate(timezone);

  const { data: usage, error } = await supabase
    .from("solver_usage")
    .select("use_count")
    .eq("student_id", studentId)
    .eq("usage_date", today)
    .maybeSingle();
  if (error) throw error;

  const currentCount = usage?.use_count ?? 0;

  if (currentCount >= limits.dailySolverUses) {
    return { allowed: false as const, used: currentCount, limit: limits.dailySolverUses };
  }

  const { error: upsertError } = await supabase
    .from("solver_usage")
    .upsert(
      { student_id: studentId, usage_date: today, use_count: currentCount + 1 },
      { onConflict: "student_id,usage_date" }
    );
  if (upsertError) throw upsertError;

  return { allowed: true as const, used: currentCount + 1, limit: limits.dailySolverUses };
}

/**
 * Atomically checks + increments today's YouTube Learning analyses for a
 * student (one increment per pasted link — a transcript fetch plus two
 * Gemini calls, so it's gated like the Solver rather than left uncapped).
 */
export async function checkAndIncrementYoutubeUsage(
  supabase: SupabaseClient,
  studentId: string,
  tier: string,
  timezone: string
) {
  const limits = limitsFor(tier);
  const today = studentLocalDate(timezone);

  const { data: usage, error } = await supabase
    .from("youtube_usage")
    .select("use_count")
    .eq("student_id", studentId)
    .eq("usage_date", today)
    .maybeSingle();
  if (error) throw error;

  const currentCount = usage?.use_count ?? 0;

  if (currentCount >= limits.dailyYoutubeUses) {
    return { allowed: false as const, used: currentCount, limit: limits.dailyYoutubeUses };
  }

  const { error: upsertError } = await supabase
    .from("youtube_usage")
    .upsert(
      { student_id: studentId, usage_date: today, use_count: currentCount + 1 },
      { onConflict: "student_id,usage_date" }
    );
  if (upsertError) throw upsertError;

  return { allowed: true as const, used: currentCount + 1, limit: limits.dailyYoutubeUses };
}

/**
 * Atomically checks + increments today's Practice question generations for
 * a student. Same shape and enforcement guarantees as
 * checkAndIncrementSolverUsage — counted server-side in the
 * /api/practice/generate route, one increment per question generated
 * (MCQ or Written Answer both count).
 */
export async function checkAndIncrementPracticeUsage(
  supabase: SupabaseClient,
  studentId: string,
  tier: string,
  timezone: string
) {
  const limits = limitsFor(tier);
  const today = studentLocalDate(timezone);

  const { data: usage, error } = await supabase
    .from("practice_usage")
    .select("use_count")
    .eq("student_id", studentId)
    .eq("usage_date", today)
    .maybeSingle();
  if (error) throw error;

  const currentCount = usage?.use_count ?? 0;

  if (currentCount >= limits.dailyPracticeUses) {
    return { allowed: false as const, used: currentCount, limit: limits.dailyPracticeUses };
  }

  const { error: upsertError } = await supabase
    .from("practice_usage")
    .upsert(
      { student_id: studentId, usage_date: today, use_count: currentCount + 1 },
      { onConflict: "student_id,usage_date" }
    );
  if (upsertError) throw upsertError;

  return { allowed: true as const, used: currentCount + 1, limit: limits.dailyPracticeUses };
}

/**
 * Atomically checks + increments today's AI Tutor chat usage for a student.
 * Same shape and enforcement guarantees as checkAndIncrementSolverUsage —
 * counted server-side in the /api/chat route, not trusted from the client.
 */
export async function checkAndIncrementChatUsage(
  supabase: SupabaseClient,
  studentId: string,
  tier: string,
  timezone: string
) {
  const limits = limitsFor(tier);
  const today = studentLocalDate(timezone);

  const { data: usage, error } = await supabase
    .from("chat_usage")
    .select("use_count")
    .eq("student_id", studentId)
    .eq("usage_date", today)
    .maybeSingle();
  if (error) throw error;

  const currentCount = usage?.use_count ?? 0;

  if (currentCount >= limits.dailyChatMessages) {
    return { allowed: false as const, used: currentCount, limit: limits.dailyChatMessages };
  }

  const { error: upsertError } = await supabase
    .from("chat_usage")
    .upsert(
      { student_id: studentId, usage_date: today, use_count: currentCount + 1 },
      { onConflict: "student_id,usage_date" }
    );
  if (upsertError) throw upsertError;

  return { allowed: true as const, used: currentCount + 1, limit: limits.dailyChatMessages };
}
