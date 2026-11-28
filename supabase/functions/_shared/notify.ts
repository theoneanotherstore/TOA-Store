// Order confirmation by WhatsApp (Meta Cloud API) and email (Resend).
// All secrets come from `supabase secrets set`. A missing secret just skips that channel.
// A failed message NEVER fails the order.

const WA_TOKEN = Deno.env.get("WHATSAPP_TOKEN");              // PLACEHOLDER: Meta permanent access token
const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID"); // PLACEHOLDER: Meta phone number ID
const WA_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE_NAME") || "order_confirmation";
const WA_LANG = Deno.env.get("WHATSAPP_TEMPLATE_LANG") || "en";
const MAIL_KEY = Deno.env.get("RESEND_API_KEY");               // PLACEHOLDER: Resend API key
const MAIL_FROM = Deno.env.get("MAIL_FROM");                   // PLACEHOLDER: e.g. "theoneanother <orders@yourdomain.com>"

type Info = { name: string; phone: string; email?: string; orderNumber: string; amountRupees: number; paymentId: string };

const inr = (n: number) => "Rs " + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toWaNumber = (p: string) => { const d = String(p).replace(/\D/g, ""); return d.length === 10 ? "91" + d : d.replace(/^0+/, ""); };

async function whatsapp(i: Info) {
  if (!WA_TOKEN || !WA_PHONE_ID) return;
  // Template body (create it in Meta, category Utility), 4 variables:
  // "Hi {{1}}, thank you for your order! Receipt no. {{2}}. Amount paid {{3}}. Payment ID {{4}}. We will update you when it ships. - theoneanother"
  const r = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: toWaNumber(i.phone), type: "template",
      template: { name: WA_TEMPLATE, language: { code: WA_LANG }, components: [{ type: "body", parameters: [
        i.name, i.orderNumber, inr(i.amountRupees), i.paymentId,
      ].map((text) => ({ type: "text", text: String(text).replace(/\s+/g, " ").slice(0, 100) })) }] },
    }),
  });
  if (!r.ok) console.error("WhatsApp send failed", r.status, await r.text());
}

async function email(i: Info) {
  if (!MAIL_KEY || !MAIL_FROM || !i.email) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px">
<h2>Thank you for your order, ${esc(i.name)}!</h2>
<p>We have received your payment.</p>
<table cellpadding="6" style="border-collapse:collapse">
<tr><td><b>Receipt / order no.</b></td><td>${esc(i.orderNumber)}</td></tr>
<tr><td><b>Amount paid</b></td><td>${esc(inr(i.amountRupees))}</td></tr>
<tr><td><b>Razorpay payment ID</b></td><td>${esc(i.paymentId)}</td></tr></table>
<p>We will update you when your order ships. Questions? Reply to this email or message us on WhatsApp.</p>
<p>- theoneanother</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${MAIL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: MAIL_FROM, to: [i.email], subject: `Order ${i.orderNumber} confirmed - receipt`, html }),
  });
  if (!r.ok) console.error("Email send failed", r.status, await r.text());
}

export async function notifyPaid(i: Info) {
  await Promise.allSettled([whatsapp(i), email(i)]);
}
