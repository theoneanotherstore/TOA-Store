// Browser -> { razorpay_order_id, razorpay_payment_id, razorpay_signature }  ->  { order_number }
import { env, hmacHex, preflight, reply, safeEq } from "../_shared/common.ts";
import { finalizeOrder } from "../_shared/finalize.ts";

const ID = /^[A-Za-z0-9_]{5,64}$/;
Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const b = await req.json().catch(() => ({}));
    const order = String(b?.razorpay_order_id ?? ""), pay = String(b?.razorpay_payment_id ?? ""), sig = String(b?.razorpay_signature ?? "");
    if (!ID.test(order) || !ID.test(pay) || !sig) return reply(req, { error: "Invalid request" }, 400);
    const expected = await hmacHex(env("RAZORPAY_KEY_SECRET"), `${order}|${pay}`);
    if (!safeEq(expected, sig)) return reply(req, { error: "Payment signature is not valid" }, 400);
    const r = await finalizeOrder(order, pay);
    if (r.error || !r.order_number) return reply(req, { error: r.error ?? "Could not create the order" }, 409);
    return reply(req, { order_number: r.order_number });
  } catch (e) { console.error(e); return reply(req, { error: "Something went wrong." }, 500); }
});
