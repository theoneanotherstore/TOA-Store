/* Section 9: checkout. Loaded with defer, after cart.js.
   Three steps (Information > Delivery > Payment), guest checkout, inline validation,
   a visible order summary, and a dedicated order-success view.
   Orders are still created by the existing place_order RPC, so the admin app needs no change.

   ============================ RAZORPAY PLACEHOLDER ============================
   Razorpay is OFF until you finish the steps below. While RZP.enabled is false the
   "Cards, net banking, wallets" option shows "Coming soon" and UPI/UTR keeps working.

   The page never sees card data: Razorpay's own window collects it.
   The secret key and the signature check MUST live on a server, never in this file.

   1. Razorpay dashboard: create an account, copy the Key ID (rzp_test_... first). Keep Key Secret private.
   2. Supabase Edge Function "create-razorpay-order"
        in:  { customer:{name,email,phone,address}, items:[{variant_id,qty,note,photos}] }
        do:  work out the total from the variants table (never trust a price from the browser),
             call Razorpay Orders API (amount in paise, currency INR, receipt = your own id),
             save a pending row (razorpay_order_id, items, customer, total).
        out: { order_id, amount }
   3. Supabase Edge Function "verify-razorpay-payment"
        in:  { razorpay_order_id, razorpay_payment_id, razorpay_signature }
        do:  check HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET) equals the signature,
             then create the real order (like create_order, paid = true, utr = payment id,
             pay_amount = amount) and mark the pending row done.
        out: { order_number }
   4. Also add a Razorpay webhook (payment.captured) that does the same as step 3, so an order
      still gets created if the customer closes the tab right after paying.
   5. Fill keyId below and set enabled:true. Add a razorpay_payment_id column to orders if you want it in the admin.
   ============================================================================= */
(function(){
 "use strict";
 const RZP={enabled:false,keyId:"rzp_test_REPLACE_ME",createFn:"create-razorpay-order",verifyFn:"verify-razorpay-payment"};

 const $=i=>document.getElementById(i),E=s=>esc(s==null?"":s),money=n=>inr(n),say=m=>toast(m);
 const dg=$("dg");
 const STEPS=["Information","Delivery","Payment"];
 const STATES=["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"];
 const FIELDS=["cn","ce","cp","k-h","k-s","k-c","k-st","k-pin","k-lm","k-ba"];
 const LSK="toa-co";
 let saved=null;try{saved=JSON.parse(localStorage.getItem(LSK)||"null")}catch(e){}
 /* Checkout state lives here so closing and reopening the window does not lose what was typed */
 const K={step:0,method:"upi",amt:"",base:-1,busy:false,upSig:"",up:null,
  d:saved?{cn:saved.cn||"",ce:saved.ce||"",cp:saved.cp||""}:{}};

 const prod=id=>S.P.find(p=>p.id==id);
 const lines=()=>C.map(i=>{const p=prod(i.pid);return p&&p.v[i.vi]?{i,p,v:p.v[i.vi]}:null}).filter(Boolean);
 const sub=()=>lines().reduce((a,l)=>a+l.v.p*l.i.q,0);
 const addWD=(d,n)=>{const x=new Date(d);while(n>0){x.setDate(x.getDate()+1);if(x.getDay()!=0)n--}return x};
 const fmt=d=>d.toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"});
 const eta=()=>{const t=new Date();return fmt(addWD(t,5))+" – "+fmt(addWD(t,7))};
 const okPh=v=>{let d=String(v).replace(/\D/g,"");if(d.length==12&&d.startsWith("91"))d=d.slice(2);else if(d.length==11&&d[0]=="0")d=d.slice(1);return/^[6-9]\d{9}$/.test(d)};

 /* ---------- validation ---------- */
 const RULES={
  cn:v=>v.trim().length<2?"Enter your full name":"",
  ce:v=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())?"":"Enter a valid email, like name@example.com",
  cp:v=>okPh(v)?"":"Enter a valid 10-digit mobile number",
  "k-h":v=>v.trim()?"":"Enter your house, flat or building number",
  "k-s":v=>v.trim().length<3?"Enter your street and area":"",
  "k-c":v=>v.trim()?"":"Enter your city",
  "k-st":v=>v?"":"Choose your state",
  "k-pin":v=>/^[1-9]\d{5}$/.test(v.trim())?"":"Enter a 6-digit PIN code",
  "k-ba":v=>$("k-bill").checked||v.trim().length>=10?"":"Enter your billing address",
  "k-cu":v=>/^[A-Za-z0-9]{8,30}$/.test(v.trim())?"":"Enter the UPI transaction ID (8 to 30 letters or digits)"
 };
 const stepFields=s=>s==0?["cn","ce","cp"]:s==1?["k-h","k-s","k-c","k-st","k-pin","k-ba"]:(K.method=="upi"?["k-cu"]:[]);
 function mark(id,msg){const el=$(id),er=$(id+"-er");if(!el)return;el.setAttribute("aria-invalid",msg?"true":"false");if(er)er.textContent=msg}
 function check(s,focus){let first=null;stepFields(s).forEach(id=>{const el=$(id);if(!el)return;const m=RULES[id](el.value);mark(id,m);if(m&&!first)first=el});
  if(s==2){const t=$("k-tc"),m=t&&!t.checked?"Please tick this box to continue":"";if($("k-tc-er"))$("k-tc-er").textContent=m;if(m&&!first)first=t}
  if(first&&focus)first.focus();return!first}

 /* ---------- data helpers ---------- */
 const g=i=>$(i)?$(i).value.trim():"";
 const addr=()=>{if(!g("k-h")&&!g("k-s")&&!g("k-pin"))return"";let a=g("k-h")+", "+g("k-s")+(g("k-lm")?"\nLandmark: "+g("k-lm"):"")+"\n"+g("k-c")+", "+g("k-st")+" - "+g("k-pin");if(!$("k-bill").checked)a+="\nBilling address: "+g("k-ba").replace(/\s*\n\s*/g,", ");return a};
 function sync(){FIELDS.forEach(id=>{if($(id))K.d[id]=$(id).value});$("ca").value=addr()}
 const customer=()=>({name:g("cn"),email:g("ce"),phone:g("cp"),address:addr()});

 /* ---------- markup ---------- */
 const fld=(id,label,tag,attrs,val,opt)=>{const v=E(val||"");const inner=tag=="textarea"?`<textarea id="${id}" ${attrs} aria-describedby="${id}-er">${v}</textarea>`:tag=="select"?`<select id="${id}" ${attrs} aria-describedby="${id}-er">${val}</select>`:`<input id="${id}" ${attrs} aria-describedby="${id}-er" value="${v}">`;
  return`<div class="k9-fd"><label for="${id}">${label}${opt?' <span class="mut">(optional)</span>':""}</label>${inner}<small class="k9-er" id="${id}-er" role="alert"></small></div>`};
 const summary=()=>{const L=lines(),s=sub();return`<h4>Order summary</h4>${L.map(l=>`<div class="k9-li"><div class="c8-th k9-th">${art(l.p)}<em>${l.i.q}</em></div><div><b>${E(l.p.name)}</b><span class="mut">${E(l.v.n)}</span></div><b>${money(l.v.p*l.i.q)}</b></div>`).join("")}<div class="c8-row"><span>Subtotal</span><b>${money(s)}</b></div><div class="c8-row"><span>Shipping</span><b class="c8-free">Free</b></div><div class="c8-row c8-tot"><span>Total</span><b>${money(s)}</b></div><p class="mut" style="font-size:13px">Estimated delivery: ${eta()}</p>`};
 const stepper=()=>STEPS.map((n,i)=>`<li class="${i<K.step?"done":i==K.step?"on":""}"><button type="button" data-goto="${i}" ${i<K.step?"":"disabled"} ${i==K.step?'aria-current="step"':""}><i>${i<K.step?"✓":i+1}</i><span>${n}</span></button></li>`).join("");
 const cu=()=>lines().some(l=>l.p.cu);

 function open(){cleanup();if(!C.length){window.openCart();return}
  const s=sub();if(K.base!==s){K.base=s;K.amt=(s+(1+Math.floor(Math.random()*99))/100).toFixed(2)}
  const d=K.d,sv=saved&&saved.h?saved:null;
  dg.className="wide";dg.dataset.co=1;
  dg.innerHTML=`<button class="x" id="k9-x" type="button" aria-label="Close checkout">×</button><div id="k9">
<div class="k9-top"><span class="k9-brand">Checkout</span><button type="button" class="c8-lk" id="k9-bc">← Back to cart</button></div>
<ol class="k9-sp" id="k9-sp" aria-label="Checkout steps">${stepper()}</ol>
<details class="k9-ms"><summary><span>Show order summary</span><b>${money(s)}</b></summary><div>${summary()}</div></details>
<div class="k9-wrap"><form id="k9-f" novalidate autocomplete="on"><input type="hidden" id="ca">
<section data-p="0"><h3 tabindex="-1">Your information</h3><p class="mut">Used only to deliver your order and keep you updated. No account needed.</p>
${fld("cn","Full name","input",'type="text" name="name" autocomplete="name" required maxlength="100"',d.cn)}
${fld("ce","Email","input",'type="email" name="email" autocomplete="email" inputmode="email" required maxlength="200"',d.ce)}
${fld("cp","Mobile number","input",'type="tel" name="tel" autocomplete="tel" inputmode="tel" required maxlength="16" placeholder="10-digit mobile number"',d.cp)}
<div class="k9-act"><span></span><button class="pri big" type="submit">Continue to delivery</button></div></section>
<section data-p="1" hidden><h3 tabindex="-1">Delivery address</h3><p class="mut">Where should we send your order?</p>
${sv?`<button type="button" class="k9-saved" data-saved="1">Use my last address: ${E(sv.h)}, ${E(sv.c)} ${E(sv.pin)}</button>`:""}
${fld("k-h","House / Flat / Building no.","input",'type="text" name="address-line1" autocomplete="shipping address-line1" required maxlength="100"',d["k-h"])}
${fld("k-s","Street and area","input",'type="text" name="address-line2" autocomplete="shipping address-line2" required maxlength="150"',d["k-s"])}
<div class="k9-2 k9-keep">${fld("k-c","City","input",'type="text" name="city" autocomplete="shipping address-level2" required maxlength="60"',d["k-c"])}${fld("k-pin","PIN code","input",'type="text" name="zip" autocomplete="shipping postal-code" inputmode="numeric" maxlength="6" required',d["k-pin"])}</div>
<div class="k9-2">${fld("k-st","State","select",'name="state" autocomplete="shipping address-level1" required','<option value="">Choose state</option>'+STATES.map(x=>`<option ${d["k-st"]==x?"selected":""}>${x}</option>`).join(""))}${fld("k-lm","Landmark","input",'type="text" name="landmark" maxlength="80"',d["k-lm"],1)}</div>
<label class="k9-chk"><input type="checkbox" id="k-bill" checked> Billing address is the same as the delivery address</label>
<div id="k9-bill" hidden>${fld("k-ba","Billing address","textarea",'rows="3" maxlength="200"',d["k-ba"])}</div>
<div class="k9-info">🚚 <span><b>Shipping: Free</b> · Estimated delivery <b>${eta()}</b><br><span class="mut">Counted from when we confirm your photos and payment.</span></span></div>
<div class="k9-act"><button type="button" data-goto="0">← Back</button><button class="pri big" type="submit">Continue to payment</button></div></section>
<section data-p="2" hidden><h3 tabindex="-1">Payment</h3><p class="mut">Total to pay <b>${money(s)}</b>. Shipping is free.</p>
<div class="k9-pm" role="radiogroup" aria-label="Payment method">
<label class="k9-opt"><input type="radio" name="k-pm" value="upi" checked><span><b>UPI, pay direct to us</b><small>Google Pay, PhonePe, Paytm or any UPI app. We verify your payment before printing.</small></span></label>
<label class="k9-opt ${RZP.enabled?"":"off"}"><input type="radio" name="k-pm" value="rzp" ${RZP.enabled?"":"disabled"}><span><b>Cards, net banking, wallets<i class="k9-soon" ${RZP.enabled?"hidden":""}>Coming soon</i></b><small>Secure payment window by Razorpay. We never see or store your card details.</small></span></label></div>
<div class="k9-box" id="k9-upi"><b>Pay by UPI</b><span class="mut">Pay exactly <b style="color:var(--o2)">₹${K.amt}</b> to <b>${E(S.set.upi)}</b>. The extra paise help us match your payment.</span><span><a class="btn" href="upi://pay?pa=${encodeURIComponent(S.set.upi)}&pn=theoneanother&am=${K.amt}&cu=INR">Open UPI app</a></span>
${fld("k-cu","UPI transaction ID (UTR) after paying","input",'type="text" name="utr" autocomplete="off" maxlength="30"',"")}</div>
<div class="k9-box" id="k9-rz" hidden><b>Pay on Razorpay</b><span class="mut">A secure Razorpay window opens to take your payment. Your order is created once it succeeds.</span></div>
<div><label class="k9-chk"><input type="checkbox" id="k-tc"> <span>I understand custom products are non-refundable and non-returnable.</span></label><small class="k9-er" id="k-tc-er" role="alert"></small></div>
<div class="k9-st" id="k9-st" role="status" aria-live="polite" hidden></div>
<div class="k9-act"><button type="button" data-goto="1">← Back</button><button class="pri big" type="submit" id="k9-pay"></button></div>
<p class="k9-secure">🔒 Your details are used only for this order. Card details are never collected on this site.</p></section>
</form><aside class="k9-aside" aria-label="Order summary">${summary()}</aside></div></div>`;
  wire();FIELDS.forEach(id=>{if($(id)&&K.d[id]!=null&&id!="k-st")$(id).value=K.d[id]||""});
  if(K.d["k-st"])$("k-st").value=K.d["k-st"];
  sync();pay();show(K.step);if(!dg.open)dg.showModal()}

 const pay=()=>{const b=$("k9-pay");if(!b)return;b.textContent=K.method=="rzp"?"Pay "+money(sub())+" securely":"Place order · "+money(sub());$("k9-upi").hidden=K.method!="upi";$("k9-rz").hidden=K.method!="rzp"};
 function show(n){K.step=n;$("k9-sp").innerHTML=stepper();dg.querySelectorAll("[data-p]").forEach(p=>p.hidden=+p.dataset.p!=n);dg.scrollTop=0;const h=dg.querySelector(`[data-p="${n}"] h3`);if(h)h.focus({preventScroll:true})}
 function status(kind,html){const b=$("k9-st");if(!b)return;b.hidden=!kind;b.className="k9-st "+(kind||"");b.innerHTML=html||""}

 /* ---------- events ---------- */
 function wire(){const root=$("k9");
  root.addEventListener("click",e=>{const t=e.target;
   if(t.closest("#k9-bc")){window.openCart();return}
   const gt=t.closest("[data-goto]");if(gt&&!gt.disabled){status();show(+gt.dataset.goto);return}
   if(t.closest("[data-saved]")){const s=saved;$("k-h").value=s.h||"";$("k-s").value=s.s||"";$("k-c").value=s.c||"";$("k-st").value=s.st||"";$("k-pin").value=s.pin||"";$("k-lm").value=s.lm||"";sync();stepFields(1).forEach(i=>mark(i,""));return}
   if(t.closest("#k9-retry")){submit();return}
   if(t.closest("#k9-upi-switch")){const r=dg.querySelector('input[value="upi"]');r.checked=true;K.method="upi";status();pay()}});
  $("k9-x").onclick=()=>dg.close();
  $("k9-f").addEventListener("submit",e=>{e.preventDefault();if(K.busy)return;if(K.step<2){if(check(K.step,true)){status();show(K.step+1)}}else submit()});
  root.addEventListener("input",e=>{const id=e.target.id;if(id&&$(id+"-er")&&e.target.getAttribute("aria-invalid")=="true"&&RULES[id]&&!RULES[id](e.target.value))mark(id,"");if(FIELDS.includes(id)){sync();clearTimeout(ckT);ckT=setTimeout(()=>saveCk(sub()),1500)}});
  root.addEventListener("focusout",e=>{const id=e.target.id;if(RULES[id]&&e.target.value!=="")mark(id,RULES[id](e.target.value))});
  root.addEventListener("change",e=>{const t=e.target;
   if(t.id=="k-bill"){$("k9-bill").hidden=t.checked;sync();if(t.checked)mark("k-ba","")}
   if(t.name=="k-pm"){K.method=t.value;status();pay()}
   if(t.id=="k-st"){sync();mark("k-st",RULES["k-st"](t.value))}});
  /* pin: digits only */
  $("k-pin").addEventListener("input",e=>{e.target.value=e.target.value.replace(/\D/g,"").slice(0,6)})}

 /* ---------- placing the order ---------- */
 async function uploadItems(){const sig=JSON.stringify(C.map(i=>[i.pid,i.vi,i.q,i.note,i.raw.map(f=>f.name+f.size)]));
  if(K.up&&K.upSig==sig)return K.up;
  const items=[];for(const i of C){const v=prod(i.pid).v[i.vi],paths=[];for(const f of i.raw){const path="uploads/"+crypto.randomUUID()+"/"+f.name.replace(/[^\w.\-]/g,"_"),u=await sb.storage.from("order-photos").upload(path,f);if(u.error)throw u.error;paths.push(path)}items.push({variant_id:v.id,qty:i.q,note:i.note||null,photos:paths})}
  K.up=items;K.upSig=sig;return items}
 async function placeUpi(items,c){const r=await sb.rpc("place_order",{p:{name:c.name,phone:c.phone,email:c.email,address:c.address,pay_amount:K.amt,utr:g("k-cu"),items}});if(r.error)throw r.error;return r.data}
 const loadRzp=()=>window.Razorpay?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement("script");s.src="https://checkout.razorpay.com/v1/checkout.js";s.onload=ok;s.onerror=()=>no(new Error("Could not load the payment window. Check your connection."));document.head.appendChild(s)});
 /* RAZORPAY PLACEHOLDER: needs the two Edge Functions described at the top of this file */
 async function placeRzp(items,c){
  if(!RZP.enabled)throw new Error("Online payment is not switched on yet. Please pay by UPI.");
  await loadRzp();
  const cr=await sb.functions.invoke(RZP.createFn,{body:{customer:c,items}});
  if(cr.error||!cr.data||!cr.data.order_id)throw new Error("Could not start the payment. Please try again.");
  return new Promise((resolve,reject)=>{
   const rz=new Razorpay({key:RZP.keyId,order_id:cr.data.order_id,amount:cr.data.amount,currency:"INR",name:"theoneanother",description:"Order payment",
    prefill:{name:c.name,email:c.email,contact:c.phone},theme:{color:"#ff6a00"},
    handler:async r=>{try{const v=await sb.functions.invoke(RZP.verifyFn,{body:{razorpay_order_id:r.razorpay_order_id,razorpay_payment_id:r.razorpay_payment_id,razorpay_signature:r.razorpay_signature}});
     if(v.error||!v.data||!v.data.order_number)throw new Error("We received your payment but could not confirm the order. Please message us on WhatsApp with payment ID "+r.razorpay_payment_id+". Do not pay again.");resolve(v.data.order_number)}catch(e){reject(e)}},
    modal:{ondismiss:()=>reject(new Error("Payment window closed. You have not been charged."))}});
   rz.on("payment.failed",r=>reject(new Error((r.error&&r.error.description)||"Payment failed. You have not been charged.")));
   rz.open()})}

 async function submit(){
  for(const s of [0,1]){if(!check(s,false)){show(s);check(s,true);return}}
  if(!check(2,true))return;
  K.busy=true;const b=$("k9-pay");b.disabled=true;status("work","⏳ Placing your order. Please do not close this window.");
  try{
   if(!sb)throw new Error("Store is not connected yet");
   const total=sub();if(total<S.set.min)throw new Error("Minimum order is "+money(S.set.min));
   for(const i of C){const p=prod(i.pid);if(!p||i.q>p.v[i.vi].s)throw new Error("Stock changed, please review your cart")}
   const c=customer(),items=await uploadItems();
   const id=K.method=="rzp"?await placeRzp(items,c):await placeUpi(items,c);
   done(id,c,total)}
  catch(err){K.busy=false;b.disabled=false;fail(err)}}
 function fail(err){const m=E(err&&err.message||"Could not place your order");
  status("fail",`<b>Order not completed</b><span>${m}</span>${K.method=="upi"?'<span>If you have already paid by UPI, please do not pay again. Message us on WhatsApp with your transaction ID and we will sort it out.</span>':""}<span class="row"><button type="button" class="pri" id="k9-retry">Try again</button>${K.method=="rzp"&&RZP.enabled?'<button type="button" id="k9-upi-switch">Pay by UPI instead</button>':""}<a class="btn" target="_blank" rel="noopener" href="${wa("Hi theoneanother, I had a problem placing my order on the website.")}">WhatsApp us</a></span>`);
  loadData().then(shop).catch(()=>{})}

 /* ---------- order confirmation ---------- */
 function done(id,c,total){
  const snap=lines().map(l=>({n:l.p.name,v:l.v.n,q:l.i.q,t:l.v.p*l.i.q,cu:l.p.cu,f:l.i.files.length})),method=K.method,amt=K.amt,utr=g("k-cu"),when=eta();
  sb.rpc("complete_checkout",{tok:ckTok()}).then(()=>{},()=>{});clearTimeout(ckT);ckReset();
  try{localStorage.setItem(LSK,JSON.stringify({cn:g("cn"),ce:g("ce"),cp:g("cp"),h:g("k-h"),s:g("k-s"),c:g("k-c"),st:g("k-st"),pin:g("k-pin"),lm:g("k-lm")}))}catch(e){}
  saved={cn:g("cn"),ce:g("ce"),cp:g("cp"),h:g("k-h"),s:g("k-s"),c:g("k-c"),st:g("k-st"),pin:g("k-pin"),lm:g("k-lm")};
  K.d={cn:saved.cn,ce:saved.ce,cp:saved.cp};K.step=0;K.busy=false;K.up=null;K.upSig="";K.base=-1;
  C=[];cartBtn();
  const msg=`Hi theoneanother, I placed order ${id} on the website.${method=="upi"?` Paid ₹${amt} (UTR ${utr}).`:""}`;
  dg.dataset.co=1;
  dg.innerHTML=`<button class="x" id="k9-x" type="button" aria-label="Close">×</button><div class="k9-ok"><div class="k9-tick" aria-hidden="true">✓</div><h2 tabindex="-1" id="k9-h">Order placed</h2><p>Thank you, ${E(c.name.split(" ")[0])}! Your order number is <b style="color:var(--o2)">${E(id)}</b>.</p><p class="mut">Save this number to track your order.</p></div>
<div class="k9-two"><div class="k9-card"><h4>Your items</h4>${snap.map(x=>`<div class="c8-row"><span>${E(x.n)} · ${E(x.v)} × ${x.q}${x.cu?` <span class="mut">(${x.f} photo${x.f==1?"":"s"})</span>`:""}</span><b>${money(x.t)}</b></div>`).join("")}<div class="c8-row"><span>Shipping</span><b class="c8-free">Free</b></div><div class="c8-row c8-tot"><span>Total</span><b>${money(total)}</b></div><p class="mut">${method=="upi"?`Payment: UPI ₹${amt}, waiting for our verification`:"Payment: Razorpay"}</p></div>
<div class="k9-card"><h4>Delivery</h4><div style="white-space:pre-line">${E(c.name)}\n${E(c.address)}\nPhone: ${E(c.phone)}</div><p><b>Estimated delivery:</b> ${when}<br><span class="mut">Counted from when we confirm your photos and payment.</span></p></div></div>
<div class="k9-card"><h4>What happens next</h4><ol class="k9-ol"><li>We verify your payment.</li><li>We check your photos with you on WhatsApp before printing.</li><li>We print, pack and ship. Delivery in 5 to 7 working days.</li></ol></div>
<div class="k9-btns"><a class="btn pri" target="_blank" rel="noopener" href="${wa(msg)}">Message us on WhatsApp</a>${$("t5-tr1")?'<button type="button" id="k9-tr">Track my order</button>':""}<button type="button" id="k9-cs">Continue shopping</button></div>`;
  $("k9-x").onclick=()=>dg.close();
  $("k9-cs").onclick=()=>{dg.close();const s=$("shopgrid");if(s)s.scrollIntoView({behavior:"smooth"})};
  if($("k9-tr"))$("k9-tr").onclick=()=>$("t5-tr1").click();
  dg.scrollTop=0;$("k9-h").focus({preventScroll:true});
  loadData().then(shop).catch(()=>{})}

 window.openCheckout=open;
 dg.addEventListener("close",()=>{delete dg.dataset.co});
 ["openP","openB"].forEach(n=>{const o=window[n];if(typeof o!="function")return;window[n]=function(){delete dg.dataset.co;return o.apply(this,arguments)}});
})();
