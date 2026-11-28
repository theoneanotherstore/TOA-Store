// Meta -> delivery receipts and customer replies. Handles STOP (opt out of offers).
import { db, digits10, env, hmacHex, safeEq, sendText } from "../_shared/common.ts";

const STOP = /^\s*(stop|unsubscribe|stop offers|cancel offers)\s*[.!]?\s*$/i;
const START = /^\s*(start|subscribe)\s*[.!]?\s*$/i;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {                              // Meta's one-time "verify" handshake
    if (url.searchParams.get("hub.mode") === "subscribe" && env("WHATSAPP_VERIFY_TOKEN") && url.searchParams.get("hub.verify_token") === env("WHATSAPP_VERIFY_TOKEN"))
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    return new Response("forbidden", { status: 403 });
  }
  const raw = await req.text();
  // Fail closed: without the app secret we cannot prove the request came from Meta, so refuse it.
  if (!env("WHATSAPP_APP_SECRET")) { console.error("WHATSAPP_APP_SECRET is not set: rejecting webhook"); return new Response("not configured", { status: 401 }); }
  const sig = (req.headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
  if (!safeEq(await hmacHex(env("WHATSAPP_APP_SECRET"), raw), sig)) return new Response("bad signature", { status: 401 });
  try {
    const d = db();
    for (const entry of JSON.parse(raw)?.entry ?? []) for (const ch of entry?.changes ?? []) {
      const v = ch?.value ?? {};
      for (const s of v.statuses ?? []) {
        const err = s?.errors?.[0];
        await d.from("wa_messages").update({ status: String(s.status), error: err ? String(err.message ?? err.title ?? "failed").slice(0, 300) : null }).eq("wa_message_id", s.id);
      }
      for (const m of v.messages ?? []) {
        const from = digits10(m.from), text = String(m?.text?.body ?? m?.button?.text ?? "").slice(0, 300);
        await d.from("wa_messages").insert({ direction: "in", phone: from, template: null, status: "received", wa_message_id: m.id ?? null, text });
        if (STOP.test(text)) { await d.rpc("wa_set_marketing", { p: from, v: false }); await sendText(from, "You will no longer get offers from theoneanother on WhatsApp. Order updates will continue. Reply START to get offers again."); }
        else if (START.test(text)) { await d.rpc("wa_set_marketing", { p: from, v: true }); await sendText(from, "Done. You will get offers from theoneanother on WhatsApp. Reply STOP any time to stop."); }
      }
    }
    return new Response("ok");
  } catch (e) { console.error(e); return new Response("ok"); }   // always 200 so Meta does not keep retrying
});
