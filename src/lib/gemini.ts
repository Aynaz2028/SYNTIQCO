import { GoogleGenerativeAI } from "@google/generative-ai";
import { MARK_SCHEME_STYLE, type CurriculumTrack } from "@/lib/curriculum";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// V1 uses Gemini 1.5 Flash for both text generation and embeddings.
const TEXT_MODEL = "gemini-1.5-flash";
const EMBED_MODEL = "text-embedding-004";

export const isGeminiConfigured = () => Boolean(genAI);

async function generate(prompt: string, systemInstruction?: string) {
  if (!genAI) {
    // Dev/demo fallback so the app runs end-to-end without a live key.
    return `[MOCK RESPONSE — set GEMINI_API_KEY to get real output]\n\n${prompt.slice(0, 300)}`;
  }
  const model = genAI.getGenerativeModel({ model: TEXT_MODEL, systemInstruction });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function embedText(text: string): Promise<number[] | null> {
  if (!genAI) return null;
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export interface WeakPointForGreeting {
  subject: string;
  topic: string;
  subtopic: string | null;
  error_type: string;
  created_at: string;
}

/**
 * Contextual Continuity greeting — a short, specific line referencing the
 * student's actual recent weak points, generated fresh from real DB rows
 * (never hardcoded).
 */
export async function generateContextualGreeting(
  studentFirstName: string,
  weakPoints: WeakPointForGreeting[]
): Promise<string> {
  if (weakPoints.length === 0) {
    return `Hi ${studentFirstName} — no weak points logged yet. Start today's 4-step mission to build your first streak.`;
  }

  const bulletList = weakPoints
    .map(
      (wp) =>
        `- ${wp.subject} / ${wp.topic}${wp.subtopic ? ` (${wp.subtopic})` : ""} — ${wp.error_type.replace("_", " ")}, logged ${wp.created_at}`
    )
    .join("\n");

  const system =
    "You are HabitFirst's daily greeting writer. Write ONE short, warm, specific sentence " +
    "(max 30 words) referencing the student's real recent weak points below, ending with a " +
    "concrete nudge to do today's 3-minute quiz. Do not invent facts not present in the data. " +
    "No emoji, no markdown.";

  const prompt = `Student name: ${studentFirstName}\nRecent weak points:\n${bulletList}`;

  try {
    return (await generate(prompt, system)).trim();
  } catch {
    const top = weakPoints[0];
    return `Hi ${studentFirstName} — you had a ${top.error_type.replace("_", " ")} in ${top.subject} (${top.topic}) recently. Let's do a 3-minute quiz on that today.`;
  }
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Multi-turn reply from a student's persona-configured AI Tutor. Keeps the
 * real conversation history so follow-ups ("what about part b?") work.
 */
export async function chatWithTutor(params: {
  systemInstruction: string;
  history: ChatTurn[];
  message: string;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<string> {
  const { systemInstruction, history, message, imageBase64, imageMimeType } = params;

  if (!genAI) {
    return `[MOCK RESPONSE — set GEMINI_API_KEY to get real output]\n\n${message.slice(0, 300)}`;
  }

  const model = genAI.getGenerativeModel({ model: TEXT_MODEL, systemInstruction });
  const chat = model.startChat({
    history: history.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    })),
  });

  const parts: (string | { inlineData: { data: string; mimeType: string } })[] = [message];
  if (imageBase64 && imageMimeType) {
    parts.push({ inlineData: { data: imageBase64, mimeType: imageMimeType } });
  }

  const result = await chat.sendMessage(parts);
  return result.response.text();
}

export interface SolverStep {
  step: number;
  explanation: string;
  latex: string;
}

export interface SolverResult {
  topicGuess: { subject: string; topic: string; subtopic: string | null };
  steps: SolverStep[];
  finalAnswerLatex: string;
}

/**
 * Step-by-step Math/Science solver, prompt-engineered per curriculum's
 * mark-scheme conventions.
 */
export async function solveQuestion(params: {
  questionText: string;
  track: CurriculumTrack;
  subjectHint?: string;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<SolverResult> {
  const { questionText, track, subjectHint, imageBase64, imageMimeType } = params;

  const system =
    `You are HabitFirst's AI Solver for a ${track === "nctb" ? "NCTB (Bangladesh)" : "Cambridge/Edexcel"} student. ` +
    MARK_SCHEME_STYLE[track] +
    " If a photo of the question is attached, read the question from the photo first. " +
    " Respond ONLY with strict JSON matching this TypeScript type, no markdown fences: " +
    `{"topicGuess":{"subject":string,"topic":string,"subtopic":string|null},"steps":[{"step":number,"explanation":string,"latex":string}],"finalAnswerLatex":string}`;

  const promptText = `Question${subjectHint ? ` (subject: ${subjectHint})` : ""}: ${questionText || "(see attached photo)"}`;

  const raw =
    imageBase64 && imageMimeType && genAI
      ? await (async () => {
          const model = genAI.getGenerativeModel({ model: TEXT_MODEL, systemInstruction: system });
          const result = await model.generateContent([
            promptText,
            { inlineData: { data: imageBase64, mimeType: imageMimeType } },
          ]);
          return result.response.text();
        })()
      : await generate(promptText, system);

  try {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    return JSON.parse(cleaned) as SolverResult;
  } catch {
    return {
      topicGuess: { subject: subjectHint ?? "General", topic: "Unclassified", subtopic: null },
      steps: [
        {
          step: 1,
          explanation: raw || "Could not parse a structured solution — check GEMINI_API_KEY.",
          latex: "",
        },
      ],
      finalAnswerLatex: "",
    };
  }
}

export interface QuizQuestion {
  question: string;
  choices: string[];
  answerIndex: number;
}

/** Generates one short quiz/MCQ question targeting a specific weak topic. */
export async function generateQuizQuestion(params: {
  subject: string;
  topic: string;
  subtopic?: string | null;
  track: CurriculumTrack;
}): Promise<QuizQuestion> {
  const { subject, topic, subtopic, track } = params;
  const system =
    `You write one short multiple-choice question (4 choices) for a ${track === "nctb" ? "NCTB" : "Cambridge/Edexcel"} ` +
    "student, targeted at the exact weak topic given, answerable in under 90 seconds. " +
    'Respond ONLY with strict JSON: {"question":string,"choices":string[4],"answerIndex":number}, no markdown fences.';
  const prompt = `Subject: ${subject}\nTopic: ${topic}${subtopic ? `\nSubtopic: ${subtopic}` : ""}`;

  const raw = await generate(prompt, system);
  try {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    return JSON.parse(cleaned) as QuizQuestion;
  } catch {
    return {
      question: `[Mock] One key idea about ${topic} in ${subject}?`,
      choices: ["Option A", "Option B", "Option C", "Option D"],
      answerIndex: 0,
    };
  }
}

export interface WrittenQuestion {
  question: string;
  maxMarks: number;
  modelAnswer: string;
}

/**
 * Generates one open-ended, exam-style written-answer question for the
 * Practice feature (student picks subject + topic themselves, not tied to
 * a weak point). The model answer / mark scheme is never sent to the
 * client until after grading — it's only used server-side by
 * gradeWrittenAnswer.
 */
export async function generatePracticeWrittenQuestion(params: {
  subject: string;
  topic: string;
  subtopic?: string | null;
  track: CurriculumTrack;
}): Promise<WrittenQuestion> {
  const { subject, topic, subtopic, track } = params;
  const system =
    `You write one short-answer exam-style question for a ${track === "nctb" ? "NCTB" : "Cambridge/Edexcel"} ` +
    "student that requires a written explanation or working, not a single word — the kind that " +
    "needs 2-5 sentences or a short derivation, answerable in under 5 minutes. Also provide the " +
    "total marks it would be worth (2-5) and a concise model answer covering every mark-worthy point. " +
    'Respond ONLY with strict JSON: {"question":string,"maxMarks":number,"modelAnswer":string}, no markdown fences.';
  const prompt = `Subject: ${subject}\nTopic: ${topic}${subtopic ? `\nSubtopic: ${subtopic}` : ""}`;

  const raw = await generate(prompt, system);
  try {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    return JSON.parse(cleaned) as WrittenQuestion;
  } catch {
    return {
      question: `[Mock] Explain the key idea behind ${topic} in ${subject}.`,
      maxMarks: 3,
      modelAnswer: "Could not generate a model answer — check GEMINI_API_KEY.",
    };
  }
}

export interface WrittenAnswerGrade {
  marksAwarded: number;
  maxMarks: number;
  isCorrect: boolean; // full (or near-full) marks
  feedback: string;
  modelAnswer: string;
}

/**
 * Grades a student's free-text answer against a question + model answer,
 * mark-scheme style, and returns instant feedback. This is the "Instant AI
 * Feedback" half of Practice's Written Answer mode.
 */
export async function gradeWrittenAnswer(params: {
  subject: string;
  topic: string;
  question: string;
  maxMarks: number;
  modelAnswer: string;
  studentAnswer: string;
  track: CurriculumTrack;
}): Promise<WrittenAnswerGrade> {
  const { subject, topic, question, maxMarks, modelAnswer, studentAnswer, track } = params;
  const system =
    `You are marking a ${track === "nctb" ? "NCTB" : "Cambridge/Edexcel"} student's written answer. ` +
    MARK_SCHEME_STYLE[track] +
    " Compare the student's answer against the model answer/mark scheme and award whole-number " +
    "marks out of the total given. Then write short, specific, encouraging feedback (under 60 words) " +
    "that names what was correct, what was missing or wrong, and one concrete tip to close the gap. " +
    'Respond ONLY with strict JSON: {"marksAwarded":number,"feedback":string}, no markdown fences.';
  const prompt =
    `Subject: ${subject}\nTopic: ${topic}\nQuestion: ${question}\nTotal marks: ${maxMarks}\n` +
    `Model answer / mark scheme: ${modelAnswer}\nStudent's answer: ${studentAnswer || "(left blank)"}`;

  const raw = await generate(prompt, system);
  try {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as { marksAwarded: number; feedback: string };
    const marksAwarded = Math.max(0, Math.min(maxMarks, Math.round(parsed.marksAwarded)));
    return {
      marksAwarded,
      maxMarks,
      isCorrect: marksAwarded >= maxMarks,
      feedback: parsed.feedback,
      modelAnswer,
    };
  } catch {
    return {
      marksAwarded: 0,
      maxMarks,
      isCorrect: false,
      feedback: "Could not grade this automatically — check GEMINI_API_KEY.",
      modelAnswer,
    };
  }
}

export interface VideoSummary {
  summary: string;
  keyPoints: string[];
}

/** Summarizes a YouTube video's transcript for YouTube Learning's Summary step. */
export async function summarizeVideoTranscript(params: {
  title: string;
  transcriptText: string;
  track: CurriculumTrack;
}): Promise<VideoSummary> {
  const { title, transcriptText, track } = params;
  const system =
    `You summarize educational YouTube videos for a ${track === "nctb" ? "NCTB" : "Cambridge/Edexcel"} ` +
    "student, based only on the transcript given. Write a clear summary of what the video teaches " +
    "(under 120 words), plus 3-5 key points as short phrases (under 15 words each), in the order " +
    "they're covered. Respond ONLY with strict JSON: " +
    '{"summary":string,"keyPoints":string[]}, no markdown fences.';
  const prompt = `Video title: ${title}\nTranscript:\n${transcriptText}`;

  const raw = await generate(prompt, system);
  try {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    return JSON.parse(cleaned) as VideoSummary;
  } catch {
    return {
      summary: `Could not summarize "${title}" — check GEMINI_API_KEY.`,
      keyPoints: [],
    };
  }
}

export interface VideoQuizQuestion {
  question: string;
  choices: string[];
  answerIndex: number;
}

/** Generates a short comprehension quiz from a video transcript for YouTube Learning. */
export async function generateQuizFromTranscript(params: {
  title: string;
  transcriptText: string;
  track: CurriculumTrack;
  count?: number;
}): Promise<VideoQuizQuestion[]> {
  const { title, transcriptText, track, count = 4 } = params;
  const system =
    `You write ${count} short multiple-choice questions (4 choices each) for a ${track === "nctb" ? "NCTB" : "Cambridge/Edexcel"} ` +
    "student, testing whether they actually understood the video below — base every question and " +
    "answer strictly on the transcript content, nothing outside it. Respond ONLY with strict JSON: " +
    '{"questions":[{"question":string,"choices":string[4],"answerIndex":number}]}, no markdown fences.';
  const prompt = `Video title: ${title}\nTranscript:\n${transcriptText}`;

  const raw = await generate(prompt, system);
  try {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as { questions: VideoQuizQuestion[] };
    return parsed.questions;
  } catch {
    return [
      {
        question: `[Mock] What's one idea covered in "${title}"?`,
        choices: ["Option A", "Option B", "Option C", "Option D"],
        answerIndex: 0,
      },
    ];
  }
}

export interface Flashcard {
  front: string;
  back: string;
}

/**
 * Generates one recall flashcard (question/prompt on the front, the
 * concise answer + a one-line "why" on the back) for a given topic.
 */
export async function generateFlashcard(params: {
  subject: string;
  topic: string;
  subtopic?: string | null;
  track: CurriculumTrack;
}): Promise<Flashcard> {
  const { subject, topic, subtopic, track } = params;
  const system =
    `You write one active-recall flashcard for a ${track === "nctb" ? "NCTB" : "Cambridge/Edexcel"} student. ` +
    "The front is a short question or prompt (under 20 words) testing recall of the topic below — " +
    "not a yes/no question. The back is the concise answer plus a one-sentence reason why, under 40 words total. " +
    'Respond ONLY with strict JSON: {"front":string,"back":string}, no markdown fences.';
  const prompt = `Subject: ${subject}\nTopic: ${topic}${subtopic ? `\nSubtopic: ${subtopic}` : ""}`;

  const raw = await generate(prompt, system);
  try {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    return JSON.parse(cleaned) as Flashcard;
  } catch {
    return {
      front: `Recall: what's the key idea behind ${topic} (${subject})?`,
      back: "Could not generate a real flashcard — check GEMINI_API_KEY.",
    };
  }
}

export interface WeakTopicReview {
  summary: string;
  commonMistake: string;
  example: string;
}

/**
 * Generates a short "re-teach" mini-lesson for the student's single
 * highest-priority weak topic — meant to be read right before they
 * attempt the matching quiz question, not a graded step itself.
 */
export async function generateWeakTopicReview(params: {
  subject: string;
  topic: string;
  subtopic?: string | null;
  track: CurriculumTrack;
}): Promise<WeakTopicReview> {
  const { subject, topic, subtopic, track } = params;
  const system =
    `You write a short re-teach note for a ${track === "nctb" ? "NCTB" : "Cambridge/Edexcel"} student who has ` +
    "been getting this exact topic wrong recently. Give: a plain-language summary of the core idea (under 40 words), " +
    "the single most common mistake students make on it (under 25 words), and one short worked example or " +
    "illustrative case (under 40 words). " +
    'Respond ONLY with strict JSON: {"summary":string,"commonMistake":string,"example":string}, no markdown fences.';
  const prompt = `Subject: ${subject}\nTopic: ${topic}${subtopic ? `\nSubtopic: ${subtopic}` : ""}`;

  const raw = await generate(prompt, system);
  try {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    return JSON.parse(cleaned) as WeakTopicReview;
  } catch {
    return {
      summary: `Could not generate a review for ${topic} (${subject}) — check GEMINI_API_KEY.`,
      commonMistake: "",
      example: "",
    };
  }
}
