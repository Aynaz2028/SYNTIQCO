import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

const VAPID_PUBLIC_KEY = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
const VAPID_CONTACT = process.env.WEB_PUSH_CONTACT_EMAIL ?? "mailto:hello@habitfirst.app";

const isPushConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (isPushConfigured) {
  webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
}

export interface RetentionAlertPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Sends a Web Push notification to every subscription a student has
 * registered. Cleans up dead subscriptions (410 Gone / 404) as it goes.
 * No-op (logs only) if VAPID keys aren't configured yet, so the rest of
 * the cron job still runs end-to-end in dev.
 */
export async function sendPushToStudent(
  supabase: SupabaseClient,
  studentId: string,
  payload: RetentionAlertPayload
) {
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("student_id", studentId);
  if (error) throw error;
  if (!subs || subs.length === 0) return { sent: 0 };

  if (!isPushConfigured) {
    console.log(`[web-push mock] would notify ${studentId}:`, payload.title, "—", payload.body);
    return { sent: 0, mocked: true };
  }

  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
        sent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    })
  );

  return { sent };
}

/**
 * SMS is explicitly out of scope for V1 (see build brief) beyond this stub
 * interface. It logs the intent so the retention-alert job's behavior is
 * visible and testable, and gives V2 a single call site to wire up an
 * MFS-region SMS provider (e.g. an SSL Wireless / Banglalink-style
 * aggregator) without touching the cron logic itself.
 */
export async function sendSmsStub(phone: string, message: string) {
  console.log(`[sms stub — no provider wired yet] to ${phone}: ${message}`);
  return { queued: false, reason: "sms_provider_not_configured" as const };
}

export function getVapidPublicKey() {
  return VAPID_PUBLIC_KEY ?? null;
}
