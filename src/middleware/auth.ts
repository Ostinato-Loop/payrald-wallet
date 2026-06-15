// RALD PayRald Wallet — Auth middleware
// LILCKY STUDIO LIMITED

import type { MiddlewareHandler } from "hono";
import { verifyJwt, bearerToken, type JwtPayload } from "../lib/auth";
import type { Bindings, Variables } from "../index";

export function authRequired(): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> {
  return async (c, next) => {
    const token = bearerToken(c.req.header("Authorization"));
    if (!token) return c.json({ error: "Authorization: Bearer <token> required", code: "MISSING_TOKEN" }, 401);
    const user = await verifyJwt(token, c.env.RALD_JWT_SECRET);
    if (!user) return c.json({ error: "Invalid or expired token", code: "INVALID_TOKEN" }, 401);
    c.set("user", user);
    await next();
  };
}
