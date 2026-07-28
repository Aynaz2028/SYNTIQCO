import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPayment } from "@/lib/payments";
import { SUBSCRIPTION_PERIOD_DAYS } from "@/lib/tiers";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export type FinalizeResult =
  | { ok: true; completed: boolean; alreadyCompleted?: boolean; tier: "pro" | "vip" }
  | { ok: false; reason: "payment_not_found" | "verify_failed" };

/**
 * Confirms an UddoktaPay invoice and, if paid, upgrades the student's tier.
 * Called from both the checkout redirect (src/app/api/subscription/callback)
 * and the server-to-server IPN (src/app/api/subscription/webhook) — both
 * funnel through here so either one landing first is enough, and the other
 * arriving afterward is a safe no-op (idempotent on subscription_payments.status).
 *
 * Uses the service-role client because this runs for a payment gateway
 * callback, not a logged-in student's own request — there's no session to
 * scope a normal client to, and the tier upgrade must bypass RLS the same
 * way the existing cron routes do.
 */
export async function finalizePayment(invoiceId: string): Promise<FinalizeResult> {
  let verified;
  try {
    verified = await verifyPayment(invoiceId);
  } catch {
    return { ok: false, reason: "verify_failed" };
  }

  const admin = createAdminClient();

  const { data: payment } = await admin
    .from("subscription_payments")
    .select("id, student_id, tier, status")
    .or(`invoice_id.eq.${invoiceId},id.eq.${verified.reference ?? NIL_UUID}`)
    .maybeSingle();

  if (!payment) return { ok: false, reason: "payment_not_found" };

  const tier = payment.tier as "pro" | "vip";

  if (payment.status === "completed") {
    return { ok: true, completed: true, alreadyCompleted: true, tier };
  }

  const isCompleted = verified.status === "COMPLETED";
  const nextStatus = isCompleted ? "completed" : verified.status === "PENDING" ? "pending" : "failed";

  await admin
    .from("subscription_payments")
    .update({
      invoice_id: invoiceId,
      status: nextStatus,
      transaction_id: verified.transactionId,
      payment_method: verified.paymentMethod ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  if (isCompleted) {
    const expiresAt = new Date(
      Date.now() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    await admin
      .from("students")
      .update({ tier, tier_expires_at: expiresAt })
      .eq("id", payment.student_id);
  }

  return { ok: true, completed: isCompleted, tier };
}
