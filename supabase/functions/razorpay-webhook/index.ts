// Razorpay calls this directly (no Supabase login), so deploy with --no-verify-jwt.
import { finalize, hmac, json, safeEq, WEBHOOK_SECRET } from "../_shared/rzp.ts";

Deno.serve(async (req) => {
  const body = await req.text();
  const sig = req.headers.get("x-razorpay-signature") || "";
  if (!safeEq(await hmac(WEBHOOK_SECRET, body), sig)) return json({ error: "Invalid signature" }, 400);
  const ev = JSON.parse(body);
  if (ev.event === "payment.captured") {
    const p = ev.payload.payment.entity;
    try { await finalize(p.order_id, p.id); } catch (e) { return json({ error: String(e) }, 500); } // 500 makes Razorpay retry
  }
  return json({ ok: true });
});
