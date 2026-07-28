import type { Personality } from "@/lib/tutor";

export type Emotion = "neutral" | "happy" | "encouraging" | "thinking" | "curious" | "celebrating";

/** Baseline expression a tutor rests on between replies, based on how they're configured. */
export const PERSONALITY_BASELINE_EMOTION: Record<Personality, Emotion> = {
  encouraging: "encouraging",
  strict: "neutral",
  funny: "happy",
  socratic: "curious",
};

const CELEBRATE_RE = /\b(great job|well done|nice work|excellent|perfect|correct!|you got it|👏|🎉|🥳)\b/i;
const ENCOURAGE_RE = /\b(don'?t worry|no worries|that'?s okay|it'?s okay|close!|good try|almost|let'?s try again|keep going|you'?re close)\b/i;
const THINKING_RE = /\b(let'?s think|let'?s consider|hmm|working through|step by step|first,? we|to solve this)\b/i;
const CURIOUS_RE = /\?\s*$|\b(what do you think|can you tell me|why do you think|what if)\b/i;
const HAPPY_RE = /\b(haha|lol|😄|😂|😊|fun fact|nice one)\b/i;

/**
 * Lightweight, local heuristic for picking an avatar expression from an assistant
 * reply's text. Deliberately simple (no extra model call / API changes) — it just
 * has to feel roughly right, not be a real sentiment classifier.
 */
export function detectEmotion(text: string, fallback: Emotion = "neutral"): Emotion {
  if (!text) return fallback;
  if (CELEBRATE_RE.test(text)) return "celebrating";
  if (ENCOURAGE_RE.test(text)) return "encouraging";
  if (THINKING_RE.test(text)) return "thinking";
  if (HAPPY_RE.test(text)) return "happy";
  if (CURIOUS_RE.test(text)) return "curious";
  return fallback;
}
