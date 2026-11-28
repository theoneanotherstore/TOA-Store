// Browser -> { customer:{name,email,phone,address}, items:[{variant_id,qty,note,photos}] }  ->  { order_id, amount }
// The price is always worked out HERE from the variants table. Nothing the browser says about money is trusted.
import { db, env, preflight, reply, validEmail, validPhone } from "../_shared/common.ts";

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const body = await req.json().catch(() => ({}));
    const c = body?.customer ?? {};
    const customer = { name: String(c.name ?? "").trim().slice(0, 100), email: String(c.email ?? "").trim().slice(0, 200), phone: String(c.phone ?? "").trim().slice(0, 30), address: String(c.address ?? "").slice(0, 600) };
    if (customer.name.length < 2 || !validPhone(customer.phone) || (customer.email && !validEmail(customer.email))) return reply(req, { error: "Please check your name, phone and email." }, 400);

    const raw = Array.isArray(body?.items) ? body.items : [];
    if (!raw.length || raw.length > 50) return reply(req, { error: "Your cart is empty." }, 400);
    const items = raw.map((i: any) => ({
      variant_id: Number(i?.variant_id), qty: Math.floor(Number(i?.qty)),
      note: i?.note ? String(i.note).slice(0, 500) : null,
      photos: Array.isArray(i?.photos) ? i.photos.slice(0, 60).map((p: unknown) => String(p).slice(0, 300)) : [],
    }));
    if (items.some((i: any) => !Number.isInteger(i.variant_id) || !(i.qty >= 1 && i.qty <= 100))) return reply(req, { error: "Invalid cart." }, 400);

    const d = db();
    const ids = [...new Set(items.map((i: any) => i.variant_id))];
    const { data: vs, error } = await d.from("variants").select("id,price,stock").in("id", ids);
    if (error || !vs || vs.length !== ids.length) return reply(req, { error: "Some items are no longer available." }, 409);
    let total = 0;
    for (const i of items) {
      const v: any = vs.find((x: any) => x.id === i.variant_id);
      if (v.stock != null && i.qty > Number(v.stock)) return reply(req, { error: "Stock changed, please review your cart." }, 409);
      total += Number(v.price) * i.qty;
    }
    const { data: m } = await d.from("settings").select("value").eq("key", "min_order").maybeSingle();
    const min = Number(m?.value) || 249;
    if (total < min) return reply(req, { error: `Minimum order is ₹${min}` }, 400);

    const amount = Math.round(total * 100);   // paise
    const auth = "Basic " + btoa(`${env("RAZORPAY_KEY_ID")}:${env("RAZORPAY_KEY_SECRET")}`);
    const r = await fetch("https://api.razorpay.com/v1/orders", { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ amount, currency: "INR", receipt: "toa_" + Date.now().toString(36), notes: { customer: customer.name, phone: customer.phone } }) });
    const o = await r.json().catch(() => ({}));
    if (!r.ok || !o?.id) { console.error("razorpay order failed", JSON.stringify(o)); return reply(req, { error: "Could not start the payment. Please try again." }, 502); }

    const ins = await d.from("razorpay_pending").insert({ rzp_order_id: o.id, status: "created", amount, customer, items });
    if (ins.error) { console.error("pending insert failed", ins.error.message); return reply(req, { error: "Could not start the payment. Please try again." }, 500); }
    return reply(req, { order_id: o.id, amount });
  } catch (e) { console.error(e); return reply(req, { error: "Something went wrong." }, 500); }
});
