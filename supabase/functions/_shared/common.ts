// Shared helpers for all TOA Edge Functions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const env = (k: string) => Deno.env.get(k) ?? "";
export const SHOP = () => env("SHOP_URL") || "https://shop.theoneanother.in";

let _db: ReturnType<typeof createClient> | null = null;
/** Service-role client: bypasses row-level security. Only ever used on the server. */
export const db = () => (_db ??= createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } }));

const ORIGINS = ["https://shop.theoneanother.in", "https://admin.theoneanother.in"];
export const corsFor = (req: Request) => {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
};
export const reply = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsFor(req), "Content-Type": "application/json" } });
export const preflight = (req: Request) => (req.method === "OPTIONS" ? new Response("ok", { headers: corsFor(req) }) : null);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const digits10 = (p: unknown) => String(p ?? "").replace(/\D/g, "").slice(-10);
export const validPhone = (p: unknown) => /^[6-9]\d{9}$/.test(digits10(p));
export const validEmail = (e: unknown) => /^\S+@\S+\.\S+$/.test(String(e ?? "")) && String(e).length <= 200;
export const firstName = (n: unknown) => String(n ?? "").trim().split(/\s+/)[0] || "there";

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export async function hmacHex(secret: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
export async function sha256Hex(t: string) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(t))); }
export function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------------- WhatsApp Cloud API ----------------
const graph = () => `https://graph.facebook.com/${env("WA_API_VERSION") || "v23.0"}/${env("WHATSAPP_PHONE_ID") || env("WHATSAPP_PHONE_NUMBER_ID")}/messages`;
const clean = (t: unknown) => String(t ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 900) || "-";

async function post(body: unknown) {
  if (!env("WHATSAPP_TOKEN") || !(env("WHATSAPP_PHONE_ID") || env("WHATSAPP_PHONE_NUMBER_ID"))) return { ok: false, id: null as string | null, error: "WhatsApp secrets are not set" };
  const r = await fetch(graph(), { method: "POST", headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, id: (d?.messages?.[0]?.id ?? null) as string | null, error: r.ok ? null : String(d?.error?.message ?? `HTTP ${r.status}`) };
}
async function log(phone: string, template: string, res: { ok: boolean; id: string | null; error: string | null }, ref?: string) {
  try { await db().from("wa_messages").insert({ direction: "out", phone: digits10(phone), template, status: res.ok ? "sent" : "failed", wa_message_id: res.id, error: res.error, ref: ref ?? null }); } catch (_) { /* logging must never break a send */ }
}

/** Send an approved template. For the OTP template pass `code`; otherwise pass the body variables in `params`. */
export async function sendTemplate(o: { to: string; template: string; params?: string[]; code?: string; ref?: string }) {
  const components: unknown[] = [];
  if (o.code) {
    components.push({ type: "body", parameters: [{ type: "text", text: o.code }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: o.code }] });
  } else if (o.params?.length) {
    components.push({ type: "body", parameters: o.params.map((t) => ({ type: "text", text: clean(t) })) });
  }
  const template: Record<string, unknown> = { name: o.template, language: { code: env("WA_TEMPLATE_LANG") || "en" } };
  if (components.length) template.components = components;
  const res = await post({ messaging_product: "whatsapp", to: "91" + digits10(o.to), type: "template", template });
  await log(o.to, o.code ? o.template + " (code hidden)" : o.template, res, o.ref);
  return res;
}

/** Plain text. WhatsApp only allows this within 24 hours after the customer last messaged you. */
export async function sendText(to: string, text: string) {
  const res = await post({ messaging_product: "whatsapp", to: "91" + digits10(to), type: "text", text: { body: text.slice(0, 1000) } });
  await log(to, "(text)", res);
  return res;
}
