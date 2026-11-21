/* upi-pay.js: UPI intent + QR + UTR submission for theoneanother store
   Needs: a Supabase client on the page, and the submit_upi_payment SQL function (Step 2). */

const UPI_CONFIG = {
  upiId: "YOUR_UPI_ID@bank",       // TODO: replace with the client's business UPI ID
  payeeName: "theoneanother",      // TODO: replace with the business name shown in the UPI app
};

function upiGetDb() {
  const candidates = [window.supabaseClient, window.sb, window.db, window.supabase];
  return candidates.find((c) => c && typeof c.rpc === "function");
}

function upiLoadQrLib() {
  return new Promise((resolve, reject) => {
    if (window.QRCode) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function upiBuildLink(orderId, amount) {
  const note = "Order " + String(orderId).slice(0, 8);
  return (
    "upi://pay?pa=" + encodeURIComponent(UPI_CONFIG.upiId) +
    "&pn=" + encodeURIComponent(UPI_CONFIG.payeeName) +
    "&am=" + Number(amount).toFixed(2) +
    "&cu=INR&tn=" + encodeURIComponent(note)
  );
}

async function showUpiPayment({ orderId, amount, mountId = "upi-pay" }) {
  const mount = document.getElementById(mountId);
  if (!mount) return console.error("upi-pay: mount element #" + mountId + " not found");

  if (UPI_CONFIG.upiId.includes("YOUR_UPI_ID")) {
    mount.innerHTML = '<p style="color:#ff6a00">UPI is not configured yet.</p>';
    return;
  }

  const link = upiBuildLink(orderId, amount);
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  mount.innerHTML = `
    <div style="max-width:380px;margin:auto;padding:20px;border:1px solid #333;border-radius:16px;background:#111;color:#fff;font-family:inherit;text-align:center">
      <h3 style="margin:0 0 4px">Pay ₹${Number(amount).toFixed(2)} with UPI</h3>
      <p style="margin:0 0 16px;color:#aaa;font-size:14px">Order ${String(orderId).slice(0, 8)}</p>
      ${isMobile ? `<a href="${link}" style="display:block;padding:14px;border-radius:999px;background:linear-gradient(90deg,#ff8a00,#ff5a00);color:#fff;font-weight:700;text-decoration:none;margin-bottom:16px">Pay with UPI app</a>` : ""}
      <div id="upi-qr" style="display:inline-block;background:#fff;padding:10px;border-radius:12px"></div>
      <p style="color:#aaa;font-size:13px;margin:10px 0 18px">${isMobile ? "Or scan this QR from another device" : "Scan with any UPI app"}</p>
      <hr style="border:0;border-top:1px solid #333;margin:0 0 16px">
      <p style="font-size:14px;margin:0 0 8px">After paying, enter the 12-digit UTR / transaction ID:</p>
      <input id="upi-utr" inputmode="numeric" maxlength="12" placeholder="e.g. 412345678901"
        style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #444;background:#1c1c1c;color:#fff;text-align:center;font-size:16px">
      <button id="upi-submit" style="width:100%;margin-top:10px;padding:12px;border:0;border-radius:999px;background:#ff6a00;color:#fff;font-weight:700;cursor:pointer">Submit payment</button>
      <p id="upi-msg" style="min-height:20px;margin:10px 0 0;font-size:14px"></p>
    </div>`;

  try {
    await upiLoadQrLib();
    new QRCode(document.getElementById("upi-qr"), { text: link, width: 180, height: 180 });
  } catch (e) {
    document.getElementById("upi-qr").textContent = "QR unavailable";
  }

  const msg = document.getElementById("upi-msg");
  document.getElementById("upi-submit").addEventListener("click", async () => {
    const utr = document.getElementById("upi-utr").value.trim();
    if (!/^[0-9]{12}$/.test(utr)) {
      msg.style.color = "#ff6a6a";
      msg.textContent = "UTR must be exactly 12 digits.";
      return;
    }
    const db = upiGetDb();
    if (!db) {
      msg.style.color = "#ff6a6a";
      msg.textContent = "Payment service not available. Please contact us on WhatsApp.";
      return;
    }
    const { error } = await db.rpc("submit_upi_payment", {
      p_order_id: String(orderId),
      p_utr: utr,
    });
    if (error) {
      msg.style.color = "#ff6a6a";
      msg.textContent = error.message;
    } else {
      msg.style.color = "#4cd964";
      msg.textContent = "Payment submitted. We'll confirm it shortly.";
      document.getElementById("upi-submit").disabled = true;
    }
  });
}
