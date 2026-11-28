// Razorpay -> payment.captured / order.paid. Creates the order even if the customer closed the tab after paying.
import { env, hmacHex, safeEq } from "../_shared/common.ts";
import { finalizeOrder } from "../_shared/finalize.ts";

Deno.serve(async (req) => {
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  const expected = await hmacHex(env("RAZORPAY_WEBHOOK_SECRET"), raw);
  if (!env("RAZORPAY_WEBHOOK_SECRET") || !safeEq(expected, sig)) return new Response("bad signature", { status: 401 });
  try {
    const ev = JSON.parse(raw);
    const pay = ev?.payload?.payment?.entity;
    if ((ev.event === "payment.captured" || ev.event === "order.paid") && pay?.order_id && pay?.id) {
      const r = await finalizeOrder(String(pay.order_id), String(pay.id), Number(pay.amount));
      if (r.error) console.error("webhook finalize:", pay.order_id, r.error);
    }
    return new Response("ok");                 // 200 stops Razorpay retrying
  } catch (e) { console.error(e); return new Response("error", { status: 500 }); }   // 500 makes Razorpay retry
});
