import { notifyPaid } from "./notify.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const cors = {
  "Access-Control-Allow-Origin": "*", // tighten to your store domain once live
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
export const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Secrets are set with `supabase secrets set`, never in code.
export const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
export const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
export const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!;
export const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

export async function hmac(secret: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const safeEq = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

/** Turn a verified payment into a real order. Idempotent: safe to call from both verify and webhook. */
export async function finalize(orderId: string, paymentId: string) {
  const db = admin();
  const { data: p } = await db.from("razorpay_pending").select("*").eq("rzp_order_id", orderId).single();
  if (!p) throw new Error("Unknown Razorpay order");
  if (p.status === "done" && p.order_number) return p.order_number as string;

  // Claim the row so verify + webhook racing each other cannot create two orders.
  const { data: claimed } = await db.from("razorpay_pending")
    .update({ status: "processing", payment_id: paymentId })
    .eq("rzp_order_id", orderId).in("status", ["created", "error"]).select("rzp_order_id");
  if (!claimed?.length) { // someone else is finishing it; wait briefly and return their result
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const { data } = await db.from("razorpay_pending").select("order_number,status").eq("rzp_order_id", orderId).single();
      if (data?.order_number) return data.order_number as string;
    }
    throw new Error("Order is still being created");
  }

  const c = p.customer;
  const { data: num, error } = await db.rpc("create_order", {
    p: { name: c.name, phone: c.phone, email: c.email, address: c.address,
         pay_amount: p.amount / 100, utr: paymentId, paid: true, source: "website", items: p.items },
  });
  if (error || !num) {
    await db.from("razorpay_pending").update({ status: "error", error: error?.message || "Order could not be created" })
      .eq("rzp_order_id", orderId);
    throw new Error(error?.message || "Order could not be created");
  }
  await db.from("orders").update({ razorpay_payment_id: paymentId, razorpay_order_id: orderId }).eq("number", num);
  await db.from("razorpay_pending").update({ status: "done", order_number: num }).eq("rzp_order_id", orderId);
  // Runs only on the call that created the order, so each customer is messaged once.
  try {
    await notifyPaid({ name: c.name, phone: c.phone, email: c.email, orderNumber: String(num),
      amountRupees: p.amount / 100, paymentId });
  } catch (e) { console.error("notify failed", e); }
  return num as string;
}
