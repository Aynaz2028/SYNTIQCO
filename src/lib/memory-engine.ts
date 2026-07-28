import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText, generateContextualGreeting } from "@/lib/gemini";

export type ErrorType = "wrong_answer" | "skipped_step" | "conceptual_gap";
export type WeakPointSource = "quiz" | "solver" | "mcq" | "flashcard" | "practice" | "youtube";

/**
 * Logs a weak point the moment a student gets something wrong, and
 * fires off an embedding update in the background (best-effort — a
 * missing GEMINI_API_KEY should never block the log write).
 */
export async function logWeakPoint(
  supabase: SupabaseClient,
  params: {
    studentId: string;
    subject: string;
    topic: string;
    subtopic?: string | null;
    errorType: ErrorType;
    source: WeakPointSource;
  }
) {
  const { studentId, subject, topic, subtopic, errorType, source } = params;

  const { data, error } = await supabase
    .from("weak_points")
    .insert({
      student_id: studentId,
      subject,
      topic,
      subtopic: subtopic ?? null,
      error_type: errorType,
      source,
    })
    .select("id")
    .single();

  if (error) throw error;

  // Best-effort embedding for clustering — never blocks the caller.
  embedText(`${subject} > ${topic}${subtopic ? ` > ${subtopic}` : ""}`)
    .then((vector) => {
      if (!vector) return;
      return supabase.from("weak_points").update({ embedding: vector }).eq("id", data.id);
    })
    .catch(() => {
      /* embedding is a nice-to-have; ignore failures */
    });

  return data.id as string;
}

/**
 * Returns the student's highest-priority weak points: highest decay_score
 * (most "owed" for review) first, most recent as a tiebreaker.
 */
export async function getPriorityWeakPoints(
  supabase: SupabaseClient,
  studentId: string,
  limit = 5
) {
  const { data, error } = await supabase
    .from("weak_points")
    .select("id, subject, topic, subtopic, error_type, decay_score, created_at")
    .eq("student_id", studentId)
    .order("decay_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

/** Builds today's Contextual Continuity greeting from real weak-point rows. */
export async function buildContextualGreeting(
  supabase: SupabaseClient,
  studentId: string,
  studentFirstName: string
) {
  const weakPoints = await getPriorityWeakPoints(supabase, studentId, 3);
  return generateContextualGreeting(studentFirstName, weakPoints);
}

/**
 * Clusters a weak point with semantically related ones using pgvector
 * cosine distance (e.g. several kinematics sub-errors grouping together),
 * so the mission generator can target a concept cluster instead of one row.
 */
export async function findRelatedWeakPoints(
  supabase: SupabaseClient,
  studentId: string,
  weakPointId: string,
  limit = 5
) {
  const { data, error } = await supabase.rpc("match_weak_points", {
    p_student_id: studentId,
    p_weak_point_id: weakPointId,
    p_match_count: limit,
  });

  // The match_weak_points RPC is optional — see supabase/migrations for the
  // SQL function to add if you want DB-side vector search instead of doing
  // the ORDER BY embedding <=> ... client-side.
  if (error) return [];
  return data;
}

/** Marks a weak point as reviewed, adjusting its decay score. */
export async function markReviewed(
  supabase: SupabaseClient,
  weakPointId: string,
  retained: boolean
) {
  const { error } = await supabase.rpc("review_weak_point", {
    p_weak_point_id: weakPointId,
    p_retained: retained,
  });
  if (error) throw error;
}

const DUE_DECAY_THRESHOLD = 0.5;
const RE_ALERT_COOLDOWN_HOURS = 20;

/**
 * Finds weak points across ALL students whose memory-decay curve says
 * they're due for revision (decay_score high enough, not alerted too
 * recently). Used by the Smart Retention Alerts cron job — this is the
 * only place in the app that queries across students, so it takes an
 * admin (service-role) client rather than a user-scoped one.
 */
export async function findWeakPointsDueForAlert(supabase: SupabaseClient) {
  const cooldownCutoff = new Date(
    Date.now() - RE_ALERT_COOLDOWN_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("weak_points")
    .select("id, student_id, subject, topic, subtopic, decay_score, last_alerted_at")
    .gte("decay_score", DUE_DECAY_THRESHOLD)
    .or(`last_alerted_at.is.null,last_alerted_at.lt.${cooldownCutoff}`)
    .order("decay_score", { ascending: false });

  if (error) throw error;
  return data;
}

export async function markAlerted(supabase: SupabaseClient, weakPointIds: string[]) {
  if (weakPointIds.length === 0) return;
  const { error } = await supabase
    .from("weak_points")
    .update({ last_alerted_at: new Date().toISOString() })
    .in("id", weakPointIds);
  if (error) throw error;
}
