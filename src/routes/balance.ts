// RALD PayRald Wallet — Balance routes
// LILCKY STUDIO LIMITED

import { Hono }                    from "hono";
import { createClient }            from "@supabase/supabase-js";
import type { Bindings, Variables } from "../index";
import { authRequired }            from "../middleware/auth";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/balance", authRequired(), async (c) => {
  const user = c.get("user")!;
  const db   = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.from("payrald_wallets")
    .select("id,wallet_type,total_balance,available_balance,pending_balance,currency,virtual_account_number,virtual_account_bank,kyc_tier,is_frozen,daily_limit,daily_used,last_activity_at,created_at,updated_at")
    .eq("user_id", user.id).maybeSingle();
  if (error)  return c.json({ error: "Failed to fetch balance" }, 500);
  if (!data)  return c.json({ error: "Wallet not found. Use POST /provision to create your wallet.", code: "WALLET_NOT_FOUND" }, 404);
  return c.json({ ok: true, wallet: data });
});

app.post("/provision", authRequired(), async (c) => {
  const user = c.get("user")!;
  const db   = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Idempotent — return existing wallet if already provisioned
  const existing = await db.from("payrald_wallets").select("*").eq("user_id", user.id).maybeSingle();
  if (existing.data) return c.json({ ok: true, wallet: existing.data, already_exists: true });

  // Create Supabase wallet record
  const { data: wallet, error: walletErr } = await db.from("payrald_wallets").insert({
    user_id: user.id, wallet_type: "Personal",
    total_balance: 0, available_balance: 0, pending_balance: 0,
    currency: "NGN", kyc_tier: 1, trust_score: user.trust_score ?? 0,
    is_frozen: false, daily_limit: 200000, daily_used: 0,
  }).select().single();

  if (walletErr) return c.json({ error: "Failed to create wallet" }, 500);

  // Optionally provision Squad virtual account
  if (c.env.SQUADCO_SECRET_KEYS && c.env.SQUADCO_PUBLIC_KEY) {
    try {
      const { squadClient } = await import("../lib/squad");
      const squad = squadClient(c.env);
      const nameParts = (user.name ?? user.username ?? user.email ?? "").split(" ");
      const va = await squad.createVirtualAccount({
        firstName:          nameParts[0] ?? "PayRald",
        lastName:           nameParts.slice(1).join(" ") || "User",
        email:              user.email,
        phone:              "08000000000",
        customerIdentifier: `payrald_${user.id}`,
      });
      await db.from("payrald_wallets").update({
        virtual_account_number: va.virtual_account_number,
        virtual_account_bank:   va.bank_name,
        virtual_account_ref:    va.customer_identifier,
        squad_virtual_ref:      va.customer_identifier,
      }).eq("user_id", user.id);
      wallet.virtual_account_number = va.virtual_account_number;
      wallet.virtual_account_bank   = va.bank_name;
    } catch (err) {
      console.warn("[payrald-wallet] virtual account provisioning failed:", err);
      // Non-fatal — wallet exists, VA can be provisioned later
    }
  }

  return c.json({ ok: true, wallet }, 201);
});

export default app;
