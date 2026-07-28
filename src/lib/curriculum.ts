export type CurriculumTrack = "nctb" | "cambridge_edexcel";

export const CURRICULUM_LEVELS: Record<CurriculumTrack, { value: string; label: string }[]> = {
  nctb: [
    { value: "ssc", label: "SSC" },
    { value: "hsc", label: "HSC" },
  ],
  cambridge_edexcel: [
    { value: "o_level", label: "O Level" },
    { value: "a_level", label: "A Level" },
  ],
};

export const SUBJECTS_BY_LEVEL: Record<string, string[]> = {
  ssc: ["Physics", "Chemistry", "Higher Math", "Biology", "General Math", "English"],
  hsc: ["Physics", "Chemistry", "Higher Math", "Biology", "ICT", "English"],
  o_level: ["Physics", "Chemistry", "Mathematics", "Biology", "Additional Math", "English"],
  a_level: ["Physics", "Chemistry", "Mathematics", "Further Math", "Biology", "Economics"],
};

// Mark-scheme convention hints used to steer the Gemini prompt per curriculum,
// so explanations match how marks are actually awarded.
export const MARK_SCHEME_STYLE: Record<CurriculumTrack, string> = {
  nctb:
    "Follow NCTB Bangladesh board conventions: show step-by-step derivation marks (each " +
    "formula substitution and numeric step is its own line), state the formula used before " +
    "substituting values, box the final answer with correct units, and use the terminology " +
    "found in NCTB textbooks (e.g. 'ক্রিয়ারত বল' style physics reasoning stated in English).",
  cambridge_edexcel:
    "Follow Cambridge/Edexcel mark-scheme conventions: use 'M1/A1/B1'-style reasoning " +
    "internally (method mark for a correct method even with an arithmetic slip, accuracy " +
    "mark for the correct final value, independent marks for stated definitions), show units " +
    "and significant figures precisely, and reference command words (state, calculate, " +
    "explain, derive) the way examiner reports expect.",
};
