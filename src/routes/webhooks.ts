// RALD PayRald Wallet — Squad top-up webhook handler
// Mirrors payrald-core webhook but scoped to wallet credit events only.
// payrald-core is the authoritative webhook handler; this is a fallback receiver.
// LILCKY STUDIO LIMITED

import { Hono }                    from "hono";
import { createClient }            from "@supabase/supabase-js";
import type { Bindings, Variables } from "../index";
import { squadClient }             from "../lib/squad";
import { publishEvent }            from "../lib/events";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.post("/webhooks/squad", async (c) => {
  const rawBody   = await c.req.text();
  const signature = c.req.header("x-squad-encrypted-body") ?? c.req.header("x-squad-signature") ?? "";
  const db        = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  if (signature) {
    const squad = squadClient(c.env);
    const valid = await squad.verifyWebhookSignature(rawBody, signature);
    if (!valid) return c.json({ error: "Invalid signature" }, 401);
  }

  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody); } catch { return c.json({ error: "Invalid JSON" }, 400); }

  const eventType = (event.Event ?? event.event_type ?? "") as string;
  const body      = (event.Body ?? event.data ?? {}) as Record<string, unknown>;
  const txRef     = (body.transaction_ref ?? body.reference ?? "") as string;

  // Log the event
  await db.from("payrald_webhook_events").insert({
    provider: "squad", event_type: eventType, event_ref: txRef || null,
    payload: event, processed: false,
  }).catch(console.error);

  if (eventType === "charge_successful" || eventType === "virtual_account_transfer_successful") {
    const customerIdentifier = (body.customer_identifier ?? "") as string;
    const amountKobo = (body.amount ?? 0) as number;
    const amountNgn  = amountKobo / 100;

    if (customerIdentifier && amountNgn > 0) {
      const userId = customerIdentifier.replace(/^payrald_/, "");
      const { data: wallet } = await db.from("payrald_wallets").select("*").eq("user_id", userId).maybeSingle();

      if (wallet) {
        await db.from("payrald_wallets").update({
          available_balance: wallet.available_balance + amountNgn,
          total_balance:     wallet.total_balance + amountNgn,
          last_activity_at:  new Date().toISOString(),
        }).eq("user_id", userId);

        await db.from("payrald_transactions").insert({
          user_id: userId, type: "top_up", direction: "credit",
          amount: amountNgn, fee: 0, currency: "NGN", status: "completed",
          provider: "squad", provider_ref: txRef || crypto.randomUUID(),
          narration: "Wallet top-up via virtual account",
          metadata: { event_type: eventType, customer_identifier: customerIdentifier },
        }).catch(console.error);

        c.executionCtx.waitUntil(
          publishEvent({
            eventType: "wallet.credited", source: "payrald-wallet", userId,
            payload: { amount: amountNgn, currency: "NGN", provider: "squad", customer_identifier: customerIdentifier },
            machineSecret: c.env.MACHINE_IDENTITY_SECRET, eventBusUrl: c.env.EVENT_BUS_URL,
          })
        );
      }
    }
  }

  await db.from("payrald_webhook_events").update({ processed: true, processed_at: new Date().toISOString() }).eq("event_ref", txRef || "").catch(console.error);
  return c.json({ ok: true });
});

export default app;
