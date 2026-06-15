// RALD PayRald Wallet — Event bus publisher
// LILCKY STUDIO LIMITED

import { signMachineJwt } from "./auth";

export async function publishEvent(p: {
  eventType: string; source: string; userId?: string;
  payload: Record<string, unknown>; machineSecret: string; eventBusUrl?: string;
}): Promise<void> {
  const url = (p.eventBusUrl ?? "https://events.rald.cloud").replace(/\/$/, "");
  try {
    const jwt = await signMachineJwt(p.machineSecret, p.source);
    await fetch(`${url}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}`, "X-Source-Service": p.source },
      body: JSON.stringify({ event_type: p.eventType, source: p.source, user_id: p.userId ?? null, payload: p.payload, metadata: {}, environment: "production" }),
    });
  } catch (err) { console.warn(`[${p.source}] event-bus failed: ${String(err)}`); }
}
