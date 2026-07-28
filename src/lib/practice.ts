import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateQuizQuestion,
  generatePracticeWrittenQuestion,
  gradeWrittenAnswer,
  type QuizQuestion,
  type WrittenQuestion,
  type WrittenAnswerGrade,
} from "@/lib/gemini";
import { logWeakPoint } from "@/lib/memory-engine";
import type { CurriculumTrack } from "@/lib/curriculum";

export type PracticeMode = "mcq" | "written";

export interface McqPracticeItem {
  mode: "mcq";
  subject: string;
  topic: string;
  subtopic: string | null;
  question: string;
  choices: string[];
  answerIndex: number;
}

export interface WrittenPracticeItem {
  mode: "written";
  subject: string;
  topic: string;
  subtopic: string | null;
  question: string;
  maxMarks: number;
  // Never sent to the client — kept server-side, referenced by id on submit.
  modelAnswer: string;
}

export type PracticeItem = McqPracticeItem | WrittenPracticeItem;

/** Generates one fresh Practice question, student-directed (own subject/topic pick). */
export async function generatePracticeItem(params: {
  subject: string;
  topic: string;
  subtopic?: string | null;
  track: CurriculumTrack;
  mode: PracticeMode;
}): Promise<PracticeItem> {
  const { subject, topic, subtopic, track, mode } = params;

  if (mode === "mcq") {
    const q: QuizQuestion = await generateQuizQuestion({ subject, topic, subtopic, track });
    return {
      mode: "mcq",
      subject,
      topic,
      subtopic: subtopic ?? null,
      question: q.question,
      choices: q.choices,
      answerIndex: q.answerIndex,
    };
  }

  const w: WrittenQuestion = await generatePracticeWrittenQuestion({
    subject,
    topic,
    subtopic,
    track,
  });
  return {
    mode: "written",
    subject,
    topic,
    subtopic: subtopic ?? null,
    question: w.question,
    maxMarks: w.maxMarks,
    modelAnswer: w.modelAnswer,
  };
}

/** Logs an MCQ Practice attempt, feeding the memory engine on a miss. */
export async function submitMcqPractice(
  supabase: SupabaseClient,
  params: {
    studentId: string;
    subject: string;
    topic: string;
    subtopic?: string | null;
    question: string;
    answerIndex: number;
    selectedIndex: number;
  }
) {
  const { studentId, subject, topic, subtopic, question, answerIndex, selectedIndex } = params;
  const isCorrect = selectedIndex === answerIndex;

  await supabase.from("practice_attempts").insert({
    student_id: studentId,
    subject,
    topic,
    subtopic: subtopic ?? null,
    mode: "mcq",
    question,
    is_correct: isCorrect,
  });

  if (!isCorrect) {
    await logWeakPoint(supabase, {
      studentId,
      subject,
      topic,
      subtopic,
      errorType: "wrong_answer",
      source: "practice",
    });
  }

  return { isCorrect };
}

/** Grades + logs a Written Answer Practice attempt, feeding the memory engine on a weak score. */
export async function submitWrittenPractice(
  supabase: SupabaseClient,
  params: {
    studentId: string;
    subject: string;
    topic: string;
    subtopic?: string | null;
    question: string;
    maxMarks: number;
    modelAnswer: string;
    studentAnswer: string;
    track: CurriculumTrack;
  }
): Promise<WrittenAnswerGrade> {
  const {
    studentId,
    subject,
    topic,
    subtopic,
    question,
    maxMarks,
    modelAnswer,
    studentAnswer,
    track,
  } = params;

  const grade = await gradeWrittenAnswer({
    subject,
    topic,
    question,
    maxMarks,
    modelAnswer,
    studentAnswer,
    track,
  });

  await supabase.from("practice_attempts").insert({
    student_id: studentId,
    subject,
    topic,
    subtopic: subtopic ?? null,
    mode: "written",
    question,
    written_answer: studentAnswer,
    marks_awarded: grade.marksAwarded,
    max_marks: grade.maxMarks,
    feedback: grade.feedback,
    is_correct: grade.isCorrect,
  });

  // Anything under full marks is a real gap — a written answer rarely gets
  // "lucky" the way a 4-choice MCQ can, so the bar for logging is lower.
  if (!grade.isCorrect) {
    await logWeakPoint(supabase, {
      studentId,
      subject,
      topic,
      subtopic,
      errorType: grade.marksAwarded === 0 ? "conceptual_gap" : "wrong_answer",
      source: "practice",
    });
  }

  return grade;
}
