const UDDOKTAPAY_BASE_URL = process.env.UDDOKTAPAY_BASE_URL || "https://sandbox.uddoktapay.com";
const UDDOKTAPAY_API_KEY = process.env.UDDOKTAPAY_API_KEY;

export const isUddoktaPayConfigured = () => Boolean(UDDOKTAPAY_API_KEY);

export interface CreateChargeInput {
  fullName: string;
  email: string;
  amount: number;
  /** Our subscription_payments.id — round-tripped via metadata so the
   *  callback/webhook can find the row before we know UddoktaPay's own
   *  invoice_id (that's only issued once the charge is created). */
  reference: string;
  redirectUrl: string;
  cancelUrl: string;
  webhookUrl: string;
}

/**
 * Calls UddoktaPay's Create Charge API and returns the hosted checkout URL
 * to redirect the student to. Dev/demo fallback (no UDDOKTAPAY_API_KEY set)
 * mirrors the GEMINI_API_KEY pattern in src/lib/gemini.ts — the flow still
 * runs end-to-end, landing straight on the redirect URL with a mock invoice
 * id instead of a real gateway.
 */
export async function createCharge(input: CreateChargeInput): Promise<{ paymentUrl: string }> {
  if (!UDDOKTAPAY_API_KEY) {
    return { paymentUrl: `${input.redirectUrl}?invoice_id=MOCK-${input.reference}` };
  }

  const res = await fetch(`${UDDOKTAPAY_BASE_URL}/api/checkout-v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "RT-UDDOKTAPAY-API-KEY": UDDOKTAPAY_API_KEY,
    },
    body: JSON.stringify({
      full_name: input.fullName,
      email: input.email,
      amount: String(input.amount),
      metadata: { reference: input.reference },
      redirect_url: input.redirectUrl,
      return_type: "GET",
      cancel_url: input.cancelUrl,
      webhook_url: input.webhookUrl,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.payment_url) {
    throw new Error(
      `UddoktaPay checkout failed (${res.status}): ${data?.message ?? "no payment_url in response"}`
    );
  }

  return { paymentUrl: data.payment_url as string };
}

export interface VerifiedPayment {
  invoiceId: string;
  status: string; // "COMPLETED" | "PENDING" | "ERROR" | ...
  amount: string | null;
  paymentMethod: string | null;
  transactionId: string | null;
  /** Our subscription_payments.id, echoed back from metadata.reference. */
  reference: string | null;
}

/** Calls UddoktaPay's Verify Payment API. Mock invoice ids (from the no-key
 *  fallback above) resolve locally without a network call. */
export async function verifyPayment(invoiceId: string): Promise<VerifiedPayment> {
  if (!UDDOKTAPAY_API_KEY || invoiceId.startsWith("MOCK-")) {
    return {
      invoiceId,
      status: "COMPLETED",
      amount: null,
      paymentMethod: "mock",
      transactionId: `MOCK-TXN-${invoiceId}`,
      reference: invoiceId.startsWith("MOCK-") ? invoiceId.slice("MOCK-".length) : null,
    };
  }

  const res = await fetch(`${UDDOKTAPAY_BASE_URL}/api/verify-payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "RT-UDDOKTAPAY-API-KEY": UDDOKTAPAY_API_KEY,
    },
    body: JSON.stringify({ invoice_id: invoiceId }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    throw new Error(`UddoktaPay verify-payment failed (${res.status})`);
  }

  return {
    invoiceId: data.invoice_id ?? invoiceId,
    status: data.status,
    amount: data.amount ?? null,
    paymentMethod: data.payment_method ?? null,
    transactionId: data.transaction_id ?? null,
    reference: data.metadata?.reference ?? null,
  };
}

/** Validates the RT-UDDOKTAPAY-API-KEY header UddoktaPay sends on webhook
 *  (IPN) requests, per their "Validate Webhook" guide. */
export function isValidWebhookApiKey(headerValue: string | null): boolean {
  return Boolean(UDDOKTAPAY_API_KEY) && headerValue === UDDOKTAPAY_API_KEY;
}
