// Turns a paid Razorpay order into a real shop order. Used by BOTH the browser verify call and the webhook,
// so an order is created exactly once even if both arrive together.
import { db, env, firstName, sendTemplate, sleep } from "./common.ts";
import { sendReceiptEmail } from "./mail.ts";

export type Result = { order_number?: string; error?: string };
const now = () => new Date().toISOString();

export async function finalizeOrder(rzpOrderId: string, paymentId: string, paidAmount?: number): Promise<Result> {
  const d = db();
  const get = async () => (await d.from("razorpay_pending").select("*").eq("rzp_order_id", rzpOrderId).maybeSingle()).data as any;
  const row = await get();
  if (!row) return { error: "Unknown payment" };
  if (row.status === "done" && row.order_number) return { order_number: row.order_number };
  if (paidAmount !== undefined && Number(paidAmount) !== Number(row.amount)) {
    await d.from("razorpay_pending").update({ status: "error", payment_id: paymentId, error: "Paid amount does not match the order", updated_at: now() }).eq("rzp_order_id", rzpOrderId);
    return { error: "Paid amount does not match the order" };
  }

  // claim the row: only one caller may create the order
  const stale = new Date(Date.now() - 2 * 60_000).toISOString();
  let claimed = (await d.from("razorpay_pending").update({ status: "processing", payment_id: paymentId, updated_at: now() })
    .eq("rzp_order_id", rzpOrderId).eq("status", "created").select("rzp_order_id")).data?.length;
  if (!claimed) claimed = (await d.from("razorpay_pending").update({ status: "processing", payment_id: paymentId, updated_at: now() })
    .eq("rzp_order_id", rzpOrderId).eq("status", "processing").lt("updated_at", stale).select("rzp_order_id")).data?.length;
  if (!claimed) {
    for (let i = 0; i < 12; i++) {           // someone else is creating it: wait for the result
      await sleep(1000);
      const r = await get();
      if (r?.status === "done" && r.order_number) return { order_number: r.order_number };
      if (r?.status === "error") return { error: r.error || "The order could not be created" };
    }
    return { error: "Still processing, please check again in a minute" };
  }

  const c = row.customer ?? {};
  const { data, error } = await d.rpc("place_order", { p: { name: c.name, phone: c.phone, email: c.email ?? "", address: c.address ?? "", pay_amount: row.amount / 100, utr: paymentId, items: row.items } });
  if (error) {
    await d.from("razorpay_pending").update({ status: "error", error: String(error.message).slice(0, 300), updated_at: now() }).eq("rzp_order_id", rzpOrderId);
    return { error: error.message };          // shows up in the admin "Paid online, no order created" list for a refund
  }
  const num = typeof data === "string" ? data : (data?.number ?? data?.order_number ?? (data != null ? String(data) : ""));

  // mark paid; fall back to a smaller update if the status value is not accepted
  let up = await d.from("orders").update({ paid: true, status: "confirmed", razorpay_payment_id: paymentId, razorpay_order_id: rzpOrderId }).eq("number", num);
  if (up.error) up = await d.from("orders").update({ paid: true, razorpay_payment_id: paymentId, razorpay_order_id: rzpOrderId }).eq("number", num);
  if (up.error) up = await d.from("orders").update({ paid: true, razorpay_payment_id: paymentId }).eq("number", num);
  if (up.error) console.error("could not mark order paid", num, up.error.message);

  await d.from("razorpay_pending").update({ status: "done", order_number: num, updated_at: now() }).eq("rzp_order_id", rzpOrderId);
  await confirmOnWhatsApp(num, c, row.amount).catch((e) => console.error("whatsapp confirmation failed", e));
  await sendReceiptEmail({ name: c.name, email: c.email, orderNumber: num, amountRupees: row.amount / 100, paymentId }).catch((e) => console.error("receipt email failed", e));
  return { order_number: num };
}

/** Order-confirmed WhatsApp message, sent once per order. */
async function confirmOnWhatsApp(orderNumber: string, c: any, amountPaise: number) {
  const d = db();
  const { data: o } = await d.from("orders").select("id,wa_confirm_sent_at").eq("number", orderNumber).maybeSingle();
  if (!o || o.wa_confirm_sent_at) return;
  const claim = await d.from("orders").update({ wa_confirm_sent_at: now() }).eq("id", o.id).is("wa_confirm_sent_at", null).select("id");
  if (!claim.data?.length) return;
  const amount = (amountPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const r = await sendTemplate({ to: c.phone, template: env("WA_TPL_ORDER") || "toa_order_confirmed", params: [firstName(c.name), orderNumber, amount], ref: orderNumber });
  if (!r.ok) await d.from("orders").update({ wa_confirm_sent_at: null }).eq("id", o.id);   // allow a retry later
}
