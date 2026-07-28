import type { SupabaseClient } from "@supabase/supabase-js";

const MASTERY_DECAY_THRESHOLD = 0.2; // a weak point below this is considered "retained"
const CERTIFICATE_MIN_POINTS = 5; // don't award a subject certificate on a tiny sample
const CERTIFICATE_MAX_AVG_DECAY = 0.15; // subject-wide backlog must be almost fully cleared

export interface SubjectProgress {
  subject: string;
  totalWeakPoints: number;
  masteredWeakPoints: number;
  masteryPct: number; // 0-100, higher = better retained
}

export interface ProfileStats {
  currentStreak: number;
  longestStreak: number;
  totalWeakPointsLogged: number;
  totalReviewed: number;
  totalSolverUses: number;
  totalQuizzes: number;
  quizAccuracyPct: number | null;
}

export interface Certificate {
  id: string;
  subject: string;
  title: string;
  issued_at: string;
}

export interface ProfileData {
  stats: ProfileStats;
  subjectProgress: SubjectProgress[];
  badges: string[];
  certificates: Certificate[];
}

/**
 * Builds the full Profile screen payload: rolled-up stats, per-subject
 * "AI memory" mastery, streak badges, and any newly-earned certificates.
 */
export async function buildProfileData(
  supabase: SupabaseClient,
  studentId: string
): Promise<ProfileData> {
  const [{ data: streak }, { data: weakPoints }, { data: quizLogs }, { data: solverLogs }] =
    await Promise.all([
      supabase
        .from("streaks")
        .select("current_streak, longest_streak, badges")
        .eq("student_id", studentId)
        .maybeSingle(),
      supabase
        .from("weak_points")
        .select("subject, decay_score, times_reviewed")
        .eq("student_id", studentId),
      supabase.from("quiz_logs").select("is_correct").eq("student_id", studentId),
      supabase.from("solver_logs").select("id").eq("student_id", studentId),
    ]);

  const points: { subject: string; decay_score: number; times_reviewed: number }[] =
    weakPoints ?? [];

  const bySubject = new Map<string, { total: number; mastered: number; decaySum: number }>();
  for (const p of points) {
    const bucket = bySubject.get(p.subject) ?? { total: 0, mastered: 0, decaySum: 0 };
    bucket.total += 1;
    bucket.decaySum += p.decay_score;
    if (p.decay_score <= MASTERY_DECAY_THRESHOLD) bucket.mastered += 1;
    bySubject.set(p.subject, bucket);
  }

  const subjectProgress: SubjectProgress[] = [...bySubject.entries()]
    .map(([subject, b]) => ({
      subject,
      totalWeakPoints: b.total,
      masteredWeakPoints: b.mastered,
      masteryPct: Math.round((1 - b.decaySum / b.total) * 100),
    }))
    .sort((a, b) => b.totalWeakPoints - a.totalWeakPoints);

  // --- Award subject-mastery certificates where earned but not yet issued ---
  const earnedSubjects = subjectProgress.filter(
    (s) =>
      s.totalWeakPoints >= CERTIFICATE_MIN_POINTS &&
      1 - s.masteryPct / 100 <= CERTIFICATE_MAX_AVG_DECAY
  );

  for (const s of earnedSubjects) {
    // Insert is idempotent thanks to the unique (student_id, subject, title)
    // constraint — safe to call on every profile load.
    await supabase.from("certificates").upsert(
      {
        student_id: studentId,
        subject: s.subject,
        title: `${s.subject} Fundamentals`,
      },
      { onConflict: "student_id,subject,title", ignoreDuplicates: true }
    );
  }

  const { data: certificates } = await supabase
    .from("certificates")
    .select("id, subject, title, issued_at")
    .eq("student_id", studentId)
    .order("issued_at", { ascending: false });

  const quizzes: { is_correct: boolean }[] = quizLogs ?? [];
  const totalQuizzes = quizzes.length;
  const correctQuizzes = quizzes.filter((q) => q.is_correct).length;

  const streakBadges: string[] = streak?.badges ?? [];
  const subjectBadges = subjectProgress
    .filter((s) => s.masteryPct >= 90 && s.totalWeakPoints >= 3)
    .map((s) => `${s.subject.toLowerCase().replace(/\s+/g, "_")}_mastered`);

  return {
    stats: {
      currentStreak: streak?.current_streak ?? 0,
      longestStreak: streak?.longest_streak ?? 0,
      totalWeakPointsLogged: points.length,
      totalReviewed: points.filter((p) => p.times_reviewed > 0).length,
      totalSolverUses: solverLogs?.length ?? 0,
      totalQuizzes,
      quizAccuracyPct: totalQuizzes > 0 ? Math.round((correctQuizzes / totalQuizzes) * 100) : null,
    },
    subjectProgress,
    badges: [...streakBadges, ...subjectBadges],
    certificates: certificates ?? [],
  };
}
