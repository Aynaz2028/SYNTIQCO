export type Personality = "encouraging" | "strict" | "funny" | "socratic";
export type Voice = "female" | "male" | "neutral";

export const PERSONALITIES: { value: Personality; label: string; blurb: string }[] = [
  { value: "encouraging", label: "Encouraging", blurb: "Warm, patient, celebrates small wins" },
  { value: "strict", label: "Strict", blurb: "Direct, exam-focused, no fluff" },
  { value: "funny", label: "Funny", blurb: "Light jokes, keeps it playful" },
  { value: "socratic", label: "Socratic", blurb: "Answers with guiding questions" },
];

export const VOICES: { value: Voice; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "neutral", label: "Neutral" },
];

export const AVATARS = ["🦉", "🐱", "🤖", "🦊", "🐢", "🧑‍🏫", "🐼", "🦁"];

export const PERSONALITY_SYSTEM_HINT: Record<Personality, string> = {
  encouraging:
    "Be warm and patient. Celebrate small wins explicitly before correcting mistakes. Never sound impatient.",
  strict:
    "Be direct and exam-focused. Don't pad with pleasantries. Point out mistakes plainly and move on to the fix.",
  funny:
    "Keep it light — a short, relevant joke or playful analogy is welcome, but never at the cost of a clear answer.",
  socratic:
    "Prefer guiding questions over direct answers when the student hasn't tried yet. Give the direct answer only if they're stuck after a hint or explicitly ask for it.",
};
