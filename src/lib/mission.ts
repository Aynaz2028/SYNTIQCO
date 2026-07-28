import type { SupabaseClient } from "@supabase/supabase-js";
import { getPriorityWeakPoints } from "@/lib/memory-engine";
import { generateQuizQuestion, generateFlashcard, generateWeakTopicReview } from "@/lib/gemini";
import { studentLocalDate } from "@/lib/streak";
import type { CurriculumTrack } from "@/lib/curriculum";

/**
 * Fetches (or lazily generates) today's 4-step mission, all AI-generated
 * fresh from the student's real weak-point data:
 *   1. Weak Topic Review — re-teach note on the single highest-priority weak point
 *   2. Flashcard Revision — active-recall card on the 2nd-priority weak point
 *   3. Weak Topic Quiz    — targeted MCQ on the same topic as the review
 *   4. Past Paper MCQ     — a general subject MCQ from the student's subjects
 *
 * Designed to complete in under ~8 minutes total.
 */
export async function getOrCreateTodaysMission(
  supabase: SupabaseClient,
  params: { studentId: string; timezone: string; track: CurriculumTrack; subjects: string[] }
) {
  const { studentId, timezone, track, subjects } = params;
  const today = studentLocalDate(timezone);

  const { data: existing, error: fetchError } = await supabase
    .from("daily_missions")
    .select("*")
    .eq("student_id", studentId)
    .eq("mission_date", today)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (existing) return existing;

  const weakPoints = await getPriorityWeakPoints(supabase, studentId, 2);
  const reviewWP = weakPoints[0] ?? null; // also the quiz target — teach it, then test it
  const flashcardWP = weakPoints[1] ?? weakPoints[0] ?? null;

  // Past Paper MCQ (and the no-weak-point fallback subject): pick a subject the
  // student is studying, round-robin by day-of-year for variety.
  const dayIndex = new Date(today).getUTCDate();
  const fallbackSubject = subjects.length > 0 ? subjects[dayIndex % subjects.length] : "General";

  const [review, flashcard, quiz, mcq] = await Promise.all([
    reviewWP
      ? generateWeakTopicReview({
          subject: reviewWP.subject,
          topic: reviewWP.topic,
          subtopic: reviewWP.subtopic,
          track,
        })
      : null,
    flashcardWP
      ? generateFlashcard({
          subject: flashcardWP.subject,
          topic: flashcardWP.topic,
          subtopic: flashcardWP.subtopic,
          track,
        })
      : generateFlashcard({ subject: fallbackSubject, topic: "General revision", track }),
    reviewWP
      ? generateQuizQuestion({
          subject: reviewWP.subject,
          topic: reviewWP.topic,
          subtopic: reviewWP.subtopic,
          track,
        })
      : null,
    generateQuizQuestion({ subject: fallbackSubject, topic: "Past paper style review", track }),
  ]);

  const row = {
    student_id: studentId,
    mission_date: today,
    flashcard_weak_point_id: flashcardWP?.id ?? null,
    quiz_weak_point_id: reviewWP?.id ?? null,
    review_ref: review ? { subject: reviewWP!.subject, topic: reviewWP!.topic, ...review } : null,
    flashcard_ref: flashcardWP
      ? { subject: flashcardWP.subject, topic: flashcardWP.topic, ...flashcard }
      : { subject: fallbackSubject, topic: "General revision", ...flashcard },
    quiz_ref: quiz ? { subject: reviewWP!.subject, topic: reviewWP!.topic, ...quiz } : null,
    mcq_ref: { subject: fallbackSubject, ...mcq },
    completed_steps: [] as string[],
  };

  const { data: inserted, error: insertError } = await supabase
    .from("daily_missions")
    .insert(row)
    .select("*")
    .single();

  if (insertError) throw insertError;
  return inserted;
}

export type MissionStep = "review" | "flashcard" | "quiz" | "mcq";
const ALL_STEPS: MissionStep[] = ["review", "flashcard", "quiz", "mcq"];

/** Marks one mission step done; returns whether the whole mission is now complete. */
export async function completeMissionStep(
  supabase: SupabaseClient,
  missionId: string,
  step: MissionStep
) {
  const { data: mission, error } = await supabase
    .from("daily_missions")
    .select("*")
    .eq("id", missionId)
    .single();
  if (error) throw error;

  const steps = new Set<MissionStep>(mission.completed_steps as MissionStep[]);
  steps.add(step);
  const completedSteps = Array.from(steps);
  const allDone = ALL_STEPS.every((s) => steps.has(s));

  const { error: updateError } = await supabase
    .from("daily_missions")
    .update({
      completed_steps: completedSteps,
      completed_at: allDone ? new Date().toISOString() : mission.completed_at,
    })
    .eq("id", missionId);
  if (updateError) throw updateError;

  return { allDone, completedSteps };
}
