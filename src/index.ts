// RALD PayRald Wallet — Cloudflare Worker
// Wallet management: balance, virtual account provisioning, Squad top-up webhooks
// Deployed at: wallet.pay.rald.cloud
// LILCKY STUDIO LIMITED

import { Hono }                      from "hono";
import { cors }                      from "hono/cors";
import type { JwtPayload }           from "./lib/auth";
import { requestLogger }             from "./lib/logger";
import balanceRoutes                 from "./routes/balance";
import webhooksRoutes                from "./routes/webhooks";

export type Bindings = {
  SUPABASE_URL:              string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RALD_JWT_SECRET:           string;
  MACHINE_IDENTITY_SECRET:   string;
  SQUADCO_SECRET_KEYS?:      string;
  SQUADCO_PUBLIC_KEY?:       string;
  SQUAD_ENV?:                string;
  EVENT_BUS_URL?:            string;
  ENVIRONMENT?:              string;
};

export type Variables = { user?: JwtPayload };

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/health",  (c) => c.json({ status: "ok", service: "payrald-wallet", version: "1.0.0", environment: c.env.ENVIRONMENT ?? "production", timestamp: new Date().toISOString() }));
app.get("/healthz", (c) => c.json({ status: "ok" }));

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("X-RALD-Service", "payrald-wallet");
  c.header("X-RALD-Owner",   "LILCKY STUDIO LIMITED");
});

app.use("*", requestLogger("payrald-wallet"));

app.use("*", cors({
  origin: (origin) => {
    const allowed = new Set(["https://pay.rald.cloud","https://payrald.rald.cloud","https://core.pay.rald.cloud","https://auth.rald.cloud","http://localhost:3000","http://localhost:5173"]);
    return allowed.has(origin ?? "") ? origin : null;
  },
  allowMethods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowHeaders: ["Content-Type","Authorization","X-Internal-Secret","X-Source-Service"],
}));

app.use("*", async (c, next) => {
  const required = ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","RALD_JWT_SECRET","MACHINE_IDENTITY_SECRET"];
  for (const k of required) {
    if (!c.env[k as keyof Bindings]) return c.json({ error: `Service misconfigured: missing ${k}`, service: "payrald-wallet" }, 503);
  }
  await next();
});

app.route("/v1", balanceRoutes);
app.route("/",   webhooksRoutes);

app.get("/", (c) => c.json({ service: "payrald-wallet", version: "1.0.0", endpoints: { balance: "GET /v1/balance", provision: "POST /v1/provision", webhook: "POST /webhooks/squad" }, timestamp: new Date().toISOString() }));
app.notFound((c) => c.json({ error: "Not found", path: c.req.path }, 404));
app.onError((err, c) => { console.error("[payrald-wallet]", err); return c.json({ error: "Internal server error" }, 500); });

export default app;
