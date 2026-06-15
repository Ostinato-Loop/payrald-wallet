// RALD PayRald Wallet — Request logger
// LILCKY STUDIO LIMITED

import type { MiddlewareHandler } from "hono";

export function requestLogger(service: string): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    const path = new URL(c.req.url).pathname;
    await next();
    console.log(JSON.stringify({ level: c.res.status >= 500 ? "error" : c.res.status >= 400 ? "warn" : "info", service, method: c.req.method, path, status: c.res.status, latency_ms: Date.now() - start, ts: new Date().toISOString() }));
  };
}
