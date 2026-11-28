// Admin only. Sends an approved template.
//   { kind:"followup", checkout_id }                      cart follow-up to one customer (needs their WhatsApp consent)
//   { kind:"offer", offer, link, dry_run? }               offer to every account holder who agreed to offers
//   { kind:"offer_one", phone, offer, link }              send an offer to one account holder (test)
import { db, digits10, env, firstName, preflight, reply, SHOP, sendTemplate, sleep } from "../_shared/common.ts";

const DAILY_CAP = 250;   // Meta's limit until the business is verified. Raise after verification. Counted over the last 24 hours.
const PER_CALL = 100;    // one click sends at most this many, so the function never runs out of time. Click again for the next batch.

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const d = db();
    const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = tok ? await d.auth.getUser(tok) : { data: null as any };
    if (!u?.user) return reply(req, { error: "Please log in to the admin again." }, 401);
    const { data: staff } = await d.from("profiles").select("id").eq("id", u.user.id).maybeSingle();
    if (!staff) return reply(req, { error: "Not allowed." }, 403);

    const b = await req.json().catch(() => ({}));
    const link = (s: unknown) => { const x = String(s ?? "").trim(); return /^https?:\/\//i.test(x) ? x.slice(0, 300) : SHOP(); };

    if (b.kind === "followup") {
      const { data: c } = await d.from("rec_checkouts").select("*").eq("id", b.checkout_id).maybeSingle();
      if (!c) return reply(req, { error: "Checkout not found." }, 404);
      if (c.payment_status === "paid" || !["active", "abandoned"].includes(c.status)) return reply(req, { error: "This checkout is already closed." }, 409);
      if (!c.phone) return reply(req, { error: "No phone number." }, 400);
      if (!c.whatsapp_opt_in) return reply(req, { error: "This customer has not agreed to WhatsApp messages. Use the manual follow-up button instead." }, 403);
      const { data: oo } = await d.rpc("wa_is_opted_out", { p: digits10(c.phone) });
      if (oo) return reply(req, { error: "This customer asked not to be contacted." }, 403);
      const items = (c.items ?? []).map((i: any) => `${i.name}${i.qty > 1 ? " x" + i.qty : ""}`).join(", ") || "your items";
      const r = await sendTemplate({ to: c.phone, template: env("WA_TPL_FOLLOWUP") || "toa_cart_followup", params: [firstName(c.name), items, `${SHOP()}/#r=${c.token}`], ref: "followup:" + c.id });
      if (!r.ok) return reply(req, { error: "WhatsApp said: " + r.error }, 502);
      await d.from("rec_messages").insert({ checkout_id: c.id, channel: "whatsapp", status: "sent", detail: "Sent by template", provider_id: r.id });
      return reply(req, { ok: true });
    }

    if (b.kind === "offer" || b.kind === "offer_one") {
      const offer = String(b.offer ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 200);
      if (offer.length < 5) return reply(req, { error: "Write the offer text first." }, 400);
      const tpl = env("WA_TPL_OFFERS") || "toa_offers";
      if (b.kind === "offer_one") {
        const r = await sendTemplate({ to: String(b.phone), template: tpl, params: ["there", offer, link(b.link)], ref: "offer_test" });
        return r.ok ? reply(req, { ok: true }) : reply(req, { error: "WhatsApp said: " + r.error }, 502);
      }
      const { data: list } = await d.rpc("wa_offer_audience");
      const everyone = (list ?? []) as { name: string; phone: string }[];
      // who already got an offer in the last 24 hours (failed sends do not count, so they are retried)
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data: done } = await d.from("wa_messages").select("phone").eq("direction", "out").eq("ref", "offer").neq("status", "failed").gt("created_at", since).limit(10000);
      const already = new Set((done ?? []).map((r: any) => digits10(r.phone)));
      const people = everyone.filter((p) => !already.has(digits10(p.phone)));
      const room = Math.max(0, DAILY_CAP - already.size);
      if (b.dry_run) return reply(req, { ok: true, audience: everyone.length, already_sent: already.size, pending: people.length, cap: DAILY_CAP, can_send_now: Math.min(room, people.length, PER_CALL) });
      const batch = people.slice(0, Math.min(room, PER_CALL));
      let sent = 0, failed = 0;
      for (const p of batch) { const r = await sendTemplate({ to: p.phone, template: tpl, params: [firstName(p.name), offer, link(b.link)], ref: "offer" }); r.ok ? sent++ : failed++; await sleep(150); }
      return reply(req, { ok: true, sent, failed, remaining: Math.max(0, people.length - batch.length), daily_room_left: Math.max(0, room - batch.length) });
    }
    return reply(req, { error: "Unknown request" }, 400);
  } catch (e) { console.error(e); return reply(req, { error: "Something went wrong." }, 500); }
});
