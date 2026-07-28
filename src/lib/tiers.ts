export const TIER_LIMITS = {
  free: {
    dailySolverUses: 5,
    memoryHistoryDays: 3,
    dailyChatMessages: 20,
    dailyPracticeUses: 10,
    dailyYoutubeUses: 5,
  },
  pro: {
    dailySolverUses: Infinity,
    memoryHistoryDays: Infinity,
    dailyChatMessages: Infinity,
    dailyPracticeUses: Infinity,
    dailyYoutubeUses: Infinity,
  },
  vip: {
    dailySolverUses: Infinity,
    memoryHistoryDays: Infinity,
    dailyChatMessages: Infinity,
    dailyPracticeUses: Infinity,
    dailyYoutubeUses: Infinity,
  },
} as const;

export type Tier = keyof typeof TIER_LIMITS;

const PAID_TIERS = new Set<string>(["pro", "vip"]);

export function limitsFor(tier: string | null | undefined) {
  if (tier === "vip") return TIER_LIMITS.vip;
  if (tier === "pro") return TIER_LIMITS.pro;
  return TIER_LIMITS.free;
}

/**
 * A paid tier (Pro/VIP) is time-boxed by `students.tier_expires_at`, set
 * whenever a subscription payment completes (see src/lib/subscription.ts).
 * Anywhere `students.tier` is read for gating purposes, run it through this
 * first so an expired subscription is treated as Free without needing a
 * background job to write the downgrade back to the row.
 */
export function effectiveTier(
  tier: string | null | undefined,
  tierExpiresAt: string | null | undefined
): Tier {
  if (!tier || !PAID_TIERS.has(tier)) return "free";
  if (!tierExpiresAt) return "free";
  return new Date(tierExpiresAt).getTime() > Date.now() ? (tier as Tier) : "free";
}

export const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  pro: "Pro",
  vip: "VIP",
};

export const PRO_PRICE_LABEL = "৳99/mo";
export const VIP_PRICE_LABEL = "৳249/mo";

// Numeric amounts used for the actual UddoktaPay charge — the labels above
// are just these formatted for display.
export const PRICE_BY_TIER: Record<"pro" | "vip", number> = {
  pro: 99,
  vip: 249,
};

export const SUBSCRIPTION_PERIOD_DAYS = 30;

export interface PlanFeatureRow {
  label: string;
  free: string;
  pro: string;
  vip: string;
}

export const PLAN_FEATURES: PlanFeatureRow[] = [
  { label: "AI Solver uses / day", free: "5", pro: "Unlimited", vip: "Unlimited" },
  { label: "AI Tutor chat messages / day", free: "20", pro: "Unlimited", vip: "Unlimited" },
  { label: "Practice questions / day", free: "10", pro: "Unlimited", vip: "Unlimited" },
  { label: "YouTube Learning analyses / day", free: "5", pro: "Unlimited", vip: "Unlimited" },
  { label: "Memory history", free: "Last 3 days", pro: "Full history", vip: "Full history" },
  { label: "Daily 3-Step Mission", free: "Included", pro: "Included", vip: "Included" },
  { label: "Streaks & badges", free: "Included", pro: "Included", vip: "Included" },
  { label: "AI response priority", free: "Standard queue", pro: "Standard queue", vip: "Priority queue" },
  { label: "New features", free: "General release", pro: "General release", vip: "Early access" },
];

export interface PaymentMethodOption {
  id: string;
  label: string;
}

// Selecting one of these just personalizes the checkout copy — UddoktaPay's
// hosted checkout page is where the student actually picks/completes the
// channel, so this list mirrors the MFS + card rails it supports rather
// than being passed as a hard filter to the Create Charge API.
export const PAYMENT_METHODS: PaymentMethodOption[] = [
  { id: "bkash", label: "bKash" },
  { id: "nagad", label: "Nagad" },
  { id: "rocket", label: "Rocket" },
  { id: "card", label: "Card" },
];
