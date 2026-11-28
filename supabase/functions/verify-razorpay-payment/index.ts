import { cors, finalize, hmac, json, KEY_SECRET, safeEq } from "../_shared/rzp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
    const expected = await hmac(KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (!safeEq(expected, String(razorpay_signature))) return json({ error: "Invalid signature" }, 400);
    const order_number = await finalize(razorpay_order_id, razorpay_payment_id);
    return json({ order_number });
  } catch (e) { return json({ error: String(e) }, 500); }
});
