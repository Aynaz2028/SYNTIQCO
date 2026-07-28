import type { SupabaseClient } from "@supabase/supabase-js";
import { extractVideoId, getVideoMeta, getVideoTranscriptText } from "@/lib/youtube";
import {
  summarizeVideoTranscript,
  generateQuizFromTranscript,
  type VideoQuizQuestion,
} from "@/lib/gemini";
import { logWeakPoint } from "@/lib/memory-engine";
import type { CurriculumTrack } from "@/lib/curriculum";

export interface VideoLesson {
  id: string;
  videoId: string;
  videoUrl: string;
  title: string;
  thumbnailUrl: string;
  subject: string;
  summary: string;
  keyPoints: string[];
  quiz: VideoQuizQuestion[];
  quizResults: Record<string, boolean>;
}

/**
 * Paste Link → Summary → Quiz Generation, all in one pass: fetches the
 * transcript, summarizes it, generates a comprehension quiz from it, and
 * saves the lesson so quiz answers can be logged against it afterward.
 */
export async function generateVideoLesson(
  supabase: SupabaseClient,
  params: { studentId: string; url: string; subject: string; track: CurriculumTrack }
): Promise<VideoLesson> {
  const { studentId, url, subject, track } = params;

  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("That doesn't look like a YouTube link — paste a full video URL.");
  }

  const [meta, transcriptText] = await Promise.all([
    getVideoMeta(videoId),
    getVideoTranscriptText(videoId),
  ]);

  const [summaryResult, quiz] = await Promise.all([
    summarizeVideoTranscript({ title: meta.title, transcriptText, track }),
    generateQuizFromTranscript({ title: meta.title, transcriptText, track }),
  ]);

  const { data: inserted, error } = await supabase
    .from("youtube_lessons")
    .insert({
      student_id: studentId,
      video_id: videoId,
      video_url: url,
      title: meta.title,
      thumbnail_url: meta.thumbnailUrl,
      subject,
      summary: summaryResult.summary,
      key_points: summaryResult.keyPoints,
      quiz,
      quiz_results: {},
    })
    .select("id")
    .single();
  if (error) throw error;

  return {
    id: inserted.id as string,
    videoId,
    videoUrl: url,
    title: meta.title,
    thumbnailUrl: meta.thumbnailUrl,
    subject,
    summary: summaryResult.summary,
    keyPoints: summaryResult.keyPoints,
    quiz,
    quizResults: {},
  };
}

/** Logs one answer to a YouTube Learning quiz question, feeding the memory engine on a miss. */
export async function submitVideoQuizAnswer(
  supabase: SupabaseClient,
  params: {
    studentId: string;
    lessonId: string;
    questionIndex: number;
    question: string;
    subject: string;
    topic: string;
    isCorrect: boolean;
  }
) {
  const { studentId, lessonId, questionIndex, question, subject, topic, isCorrect } = params;

  const { data: lesson, error } = await supabase
    .from("youtube_lessons")
    .select("quiz_results")
    .eq("id", lessonId)
    .eq("student_id", studentId)
    .single();
  if (error) throw error;

  const quizResults = {
    ...(lesson.quiz_results as Record<string, boolean>),
    [String(questionIndex)]: isCorrect,
  };

  const { error: updateError } = await supabase
    .from("youtube_lessons")
    .update({ quiz_results: quizResults })
    .eq("id", lessonId);
  if (updateError) throw updateError;

  if (!isCorrect) {
    await logWeakPoint(supabase, {
      studentId,
      subject,
      topic,
      subtopic: question.slice(0, 120),
      errorType: "wrong_answer",
      source: "youtube",
    });
  }

  return { quizResults };
}
