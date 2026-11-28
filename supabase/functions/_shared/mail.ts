// Receipt email through Resend. Skipped if RESEND_API_KEY / MAIL_FROM are not set. Never blocks an order.
import { env } from "./common.ts";

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const inr = (n: number) => "Rs " + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function sendReceiptEmail(i: { name: string; email?: string; orderNumber: string; amountRupees: number; paymentId: string }) {
  if (!env("RESEND_API_KEY") || !env("MAIL_FROM") || !i.email) return;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px">
<h2>Thank you for your order, ${esc(i.name)}!</h2><p>We have received your payment.</p>
<table cellpadding="6" style="border-collapse:collapse">
<tr><td><b>Receipt / order no.</b></td><td>${esc(i.orderNumber)}</td></tr>
<tr><td><b>Amount paid</b></td><td>${esc(inr(i.amountRupees))}</td></tr>
<tr><td><b>Razorpay payment ID</b></td><td>${esc(i.paymentId)}</td></tr></table>
<p>We will update you when your order ships. Questions? Reply to this email or message us on WhatsApp.</p><p>- theoneanother</p></div>`;
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("MAIL_FROM"), to: [i.email], subject: `Order ${i.orderNumber} confirmed - receipt`, html }) });
  if (!r.ok) console.error("Email send failed", r.status, await r.text());
}
