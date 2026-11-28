import { admin, cors, json, KEY_ID, KEY_SECRET } from "../_shared/rzp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { customer, items } = await req.json();
    if (!customer?.name || !customer?.phone || !Array.isArray(items) || !items.length) return json({ error: "Bad request" }, 400);

    // Price comes from the database, never from the browser.
    const db = admin();
    const ids = items.map((i: any) => i.variant_id);
    const { data: vs, error } = await db.from("variants").select("id,price,stock").in("id", ids);
    if (error || !vs) return json({ error: "Could not read prices" }, 500);
    let total = 0;
    for (const i of items) {
      const v = vs.find((x: any) => x.id === i.variant_id);
      const q = Math.floor(Number(i.qty));
      if (!v || q < 1 || q > v.stock) return json({ error: "Stock changed, please review your cart" }, 409);
      total += Number(v.price) * q;
    }
    const amount = Math.round(total * 100); // paise

    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(`${KEY_ID}:${KEY_SECRET}`) },
      body: JSON.stringify({ amount, currency: "INR", receipt: "toa_" + Date.now() }),
    });
    const o = await r.json();
    if (!r.ok) return json({ error: o?.error?.description || "Razorpay error" }, 502);

    await db.from("razorpay_pending").insert({ rzp_order_id: o.id, amount, customer, items });
    return json({ order_id: o.id, amount });
  } catch (e) { return json({ error: String(e) }, 500); }
});
