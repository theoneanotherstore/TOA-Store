// WhatsApp 6-digit code for sign-up and log-in. No password, no SMS provider.
//   { action:"send",   purpose:"signup", name, phone, email, marketing }  or  { action:"send", purpose:"login", phone }
//   { action:"verify", purpose, phone, code }  ->  { token_hash }   (the browser then calls auth.verifyOtp to get a session)
import { db, digits10, env, preflight, reply, safeEq, sendTemplate, sha256Hex, validEmail, validPhone } from "../_shared/common.ts";

const TTL_MIN = 5, MAX_TRIES = 5, MAX_PER_HOUR = 5, GAP_SECONDS = 30, MAX_PER_IP_HOUR = 15;
const pepper = () => env("OTP_PEPPER") || env("WHATSAPP_VERIFY_TOKEN");
const hashCode = (code: string, phone: string) => sha256Hex(`${code}:${phone}:${pepper()}`);
const newCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
const clientIp = (req: Request) => (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64) || "unknown";

/** Cloudflare Turnstile. Only enforced once TURNSTILE_SECRET is set, so you can deploy this before the page sends a token. */
async function captchaOk(token: unknown, ip: string) {
  const secret = env("TURNSTILE_SECRET");
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: String(token).slice(0, 2048), remoteip: ip });
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body }).catch(() => null);
  const d = await r?.json().catch(() => null);
  return d?.success === true;
}

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const b = await req.json().catch(() => ({}));
    const action = String(b?.action ?? ""), purpose = b?.purpose === "login" ? "login" : "signup";
    if (!validPhone(b?.phone)) return reply(req, { error: "Enter a valid 10-digit mobile number." }, 400);
    const phone = digits10(b.phone), d = db();

    if (action === "send") {
      const ip = clientIp(req);
      if (!(await captchaOk(b?.captcha, ip))) return reply(req, { error: "Please complete the captcha and try again." }, 400);
      const ipAgo = new Date(Date.now() - 3600_000).toISOString();
      const { count: ipCount } = await d.from("wa_otps").select("id", { count: "exact", head: true }).eq("ip", ip).gt("created_at", ipAgo);
      if ((ipCount ?? 0) >= MAX_PER_IP_HOUR) return reply(req, { error: "Too many requests from your network. Please try again later." }, 429);
      const name = String(b?.name ?? "").trim().slice(0, 100), email = String(b?.email ?? "").trim().toLowerCase();
      const { data: acc } = await d.rpc("wa_find_account", { p: phone });
      const existing = Array.isArray(acc) ? acc[0] : acc;
      if (purpose === "signup") {
        if (name.length < 2) return reply(req, { error: "Enter your name." }, 400);
        if (!validEmail(email)) return reply(req, { error: "Enter a valid email." }, 400);
        if (existing) return reply(req, { error: "This number already has an account. Please log in." }, 409);
        const { data: taken } = await d.rpc("wa_email_taken", { e: email });
        if (taken) return reply(req, { error: "This email is already in use. Try logging in or use another email." }, 409);
      } else if (!existing) {
        return reply(req, { error: "No account found for this number. Create one first." }, 404);
      }

      // rate limits
      const hourAgo = new Date(Date.now() - 3600_000).toISOString();
      const { data: recent } = await d.from("wa_otps").select("created_at").eq("phone", phone).gt("created_at", hourAgo).order("created_at", { ascending: false });
      if ((recent?.length ?? 0) >= MAX_PER_HOUR) return reply(req, { error: "Too many codes requested. Please try again in an hour." }, 429);
      if (recent?.[0] && Date.now() - new Date(recent[0].created_at).getTime() < GAP_SECONDS * 1000) return reply(req, { error: `Please wait ${GAP_SECONDS} seconds before asking for another code.` }, 429);

      const code = newCode();
      await d.from("wa_otps").delete().eq("phone", phone).eq("purpose", purpose).is("consumed_at", null);
      const ins = await d.from("wa_otps").insert({ phone, purpose, code_hash: await hashCode(code, phone), name: name || null, email: email || null, marketing: b?.marketing === true, ip, expires_at: new Date(Date.now() + TTL_MIN * 60_000).toISOString() });
      if (ins.error) { console.error(ins.error.message); return reply(req, { error: "Something went wrong." }, 500); }
      const sent = await sendTemplate({ to: phone, template: env("WA_TPL_OTP") || "toa_login_code", code });
      if (!sent.ok) { await d.from("wa_otps").delete().eq("phone", phone).eq("purpose", purpose).is("consumed_at", null); console.error("otp send failed:", sent.error); return reply(req, { error: "Could not send the WhatsApp message. Check the number has WhatsApp and try again." }, 502); }
      return reply(req, { ok: true, expires_in: TTL_MIN * 60 });
    }

    if (action === "verify") {
      const code = String(b?.code ?? "").trim();
      if (!/^\d{6}$/.test(code)) return reply(req, { error: "Enter the 6-digit code." }, 400);
      const { data: row } = await d.from("wa_otps").select("*").eq("phone", phone).eq("purpose", purpose).is("consumed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!row || new Date(row.expires_at).getTime() < Date.now()) return reply(req, { error: "That code has expired. Ask for a new one." }, 400);
      if (row.attempts >= MAX_TRIES) { await d.from("wa_otps").delete().eq("id", row.id); return reply(req, { error: "Too many wrong tries. Ask for a new code." }, 429); }
      // Spend one attempt BEFORE looking at the code, atomically (compare-and-swap on the attempts value).
      // Parallel guesses all read the same value, only one of them wins the swap, the rest are refused unchecked.
      const spent = await d.from("wa_otps").update({ attempts: row.attempts + 1 }).eq("id", row.id).eq("attempts", row.attempts).is("consumed_at", null).select("id");
      if (!spent.data?.length) return reply(req, { error: "Please try again in a moment." }, 429);
      if (!safeEq(await hashCode(code, phone), row.code_hash)) return reply(req, { error: "That code is not right." }, 400);
      const used = await d.from("wa_otps").update({ consumed_at: new Date().toISOString() }).eq("id", row.id).is("consumed_at", null).select("id");
      if (!used.data?.length) return reply(req, { error: "That code was already used." }, 400);

      let email: string;
      if (purpose === "signup") {
        email = String(row.email);
        const made = await d.auth.admin.createUser({ email, email_confirm: true, user_metadata: { account_type: "customer", name: row.name, phone } });
        if (made.error) { console.error("createUser:", made.error.message); return reply(req, { error: "This email can't be used. Try another one." }, 409); }
        if (row.marketing) await d.rpc("wa_set_marketing", { p: phone, v: true });
      } else {
        const { data: acc } = await d.rpc("wa_find_account", { p: phone });
        const a = Array.isArray(acc) ? acc[0] : acc;
        if (!a?.email) return reply(req, { error: "No account found for this number." }, 404);
        email = a.email;
      }
      // a one-time login token for that customer; the browser exchanges it for a session
      const link = await d.auth.admin.generateLink({ type: "magiclink", email });
      const token_hash = link.data?.properties?.hashed_token;
      if (link.error || !token_hash) { console.error("generateLink:", link.error?.message); return reply(req, { error: "Could not log you in. Please try again." }, 500); }
      return reply(req, { ok: true, token_hash });
    }
    return reply(req, { error: "Unknown action" }, 400);
  } catch (e) { console.error(e); return reply(req, { error: "Something went wrong." }, 500); }
});
