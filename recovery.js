/* Cart recovery: activity tracking, consent boxes, recovery links. Loaded with defer, after checkout.js.
   Every call is fire-and-forget, so a failure here never affects shopping or payment. */
(function(){
 "use strict";
 if(typeof sb=="undefined"||!sb)return;
 const $=i=>document.getElementById(i),dg=$("dg"),KEY="toa-cart",CON="toa-consent";
 const get=k=>{try{return localStorage.getItem(k)}catch(e){return null}},put=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}};
 let mem=null;
 const cart=()=>{let c=get(KEY)||mem;if(!c){c=mem=crypto.randomUUID();put(KEY,c)}return c};
 const items=()=>C.map(i=>{const p=S.P.find(x=>x.id==i.pid),v=p&&p.v[i.vi];return v?{variant_id:v.id,qty:i.q}:null}).filter(Boolean);
 const val=i=>$(i)?$(i).value.trim():"";
 let consent={};try{consent=JSON.parse(get(CON)||"{}")}catch(e){}
 let queue=Promise.resolve(),inCheckout=false;
 function track(event,extra){
  const p=Object.assign({cart_id:cart(),event},extra);
  if(inCheckout){p.name=val("cn")||undefined;p.email=val("ce")||undefined;p.phone=val("cp")||undefined;
   if(typeof consent.e=="boolean")p.email_opt_in=consent.e;if(typeof consent.w=="boolean")p.whatsapp_opt_in=consent.w}
  /* one at a time, so events arrive in order */
  queue=queue.then(()=>sb.rpc("rec_track",{p})).then(()=>{},()=>{});
 }

 /* product viewed */
 ["openP","openB"].forEach(n=>{const o=window[n];if(typeof o!="function")return;window[n]=function(id){inCheckout=false;track("product_viewed",{product_id:+id});return o.apply(this,arguments)}});

 /* cart added / updated / removed: compare the cart each time the counter is redrawn */
 let last={},quiet=false;
 const snap=()=>items().reduce((m,i)=>(m[i.variant_id]=(m[i.variant_id]||0)+i.qty,m),{});
 const oc=window.cartBtn;
 window.cartBtn=function(){const r=oc.apply(this,arguments);
  try{const now=snap(),ids=Object.keys(Object.assign({},last,now)),ch=ids.filter(k=>last[k]!==now[k]);
   if(ch.length&&!quiet)track(ch.some(k=>!last[k])?"cart_added":ch.some(k=>!now[k])?"cart_removed":"cart_updated",{items:items()});
   last=now}catch(e){}
  return r};

 /* checkout: started, fields, consent */
 const box=(id,key,text)=>`<label class="k9-chk"><input type="checkbox" id="${id}" ${consent[key]?"checked":""}> <span>${text}</span></label>`;
 const oco=window.openCheckout;
 if(typeof oco=="function")window.openCheckout=function(){const r=oco.apply(this,arguments);
  const ph=$("cp");if(ph&&!$("rec-e")){ph.closest(".k9-fd").insertAdjacentHTML("afterend",
    box("rec-e","e","Email me a reminder if I don't finish my order")+box("rec-w","w","Send me order reminders on WhatsApp")+
    '<p class="mut" style="font-size:12.5px">Optional. We save your cart and contact details while you check out. You can unsubscribe or reply STOP any time.</p>');
   inCheckout=true;track("checkout_started",{items:items()})}
  return r};
 const EV={cn:"name_entered",ce:"email_entered",cp:"phone_entered"},sent={};
 const valid={cn:v=>v.length>1,ce:v=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),cp:v=>/^(\+?91|0)?[6-9]\d{9}$/.test(v.replace(/[\s-]/g,""))};
 function field(id){const v=val(id);if(EV[id]&&valid[id](v)&&sent[id]!==v){sent[id]=v;track(EV[id])}}
 const timers={};
 dg.addEventListener("input",e=>{const id=e.target.id;if(!dg.dataset.co||!EV[id])return;clearTimeout(timers[id]);timers[id]=setTimeout(()=>field(id),1200)});
 dg.addEventListener("focusout",e=>{if(dg.dataset.co&&EV[e.target.id])field(e.target.id)});
 dg.addEventListener("change",e=>{const t=e.target;if(t.id!="rec-e"&&t.id!="rec-w")return;consent[t.id=="rec-e"?"e":"w"]=t.checked;put(CON,JSON.stringify(consent));track("consent_changed")});
 /* address completed = the delivery step passed validation and the payment step is showing */
 let addrSent=false;
 new MutationObserver(()=>{const p=dg.querySelector('[data-p="2"]');if(p&&!p.hidden&&!addrSent){addrSent=true;track("address_completed",{items:items()})}}).observe(dg,{subtree:true,attributes:true,attributeFilter:["hidden"]});
 dg.addEventListener("close",()=>{inCheckout=false});

 /* payment events, sent by checkout.js. The server only trusts Razorpay and the orders table for "paid". */
 addEventListener("toa:pay",e=>{const d=e.detail||{};
  if(d.state=="initiated")track("payment_initiated",{rzp_order_id:d.order_id,items:items()});
  else if(d.state=="failed")track("payment_failed");
  else if(d.state=="success"){quiet=true;inCheckout=false;put(KEY,null);mem=null;addrSent=false;for(const k in sent)delete sent[k];setTimeout(()=>{quiet=false;last=snap()},0)}});

 /* recovery link (#r=...) and unsubscribe link (#unsub=...) */
 function whenReady(fn,n){if(S.P&&S.P.length)return fn();if((n||0)<60)setTimeout(()=>whenReady(fn,(n||0)+1),250)}
 const m=location.hash.match(/^#(r|unsub)=([\w.]+)$/);
 if(!m)return;
 history.replaceState(null,"",location.pathname+location.search);
 if(m[1]=="unsub"){dg.className="";dg.innerHTML='<h3>Stop order reminders?</h3><p class="mut" style="margin:10px 0 16px">We will stop sending cart reminders by email and WhatsApp. Order updates are not affected.</p><button type="button" class="pri" id="un-y">Unsubscribe</button> <button type="button" id="un-n">Cancel</button>';
  $("un-n").onclick=()=>dg.close();
  $("un-y").onclick=()=>sb.rpc("rec_unsubscribe",{tok:m[2]}).then(r=>{dg.close();toast(!r.error&&r.data?"You are unsubscribed":"That link is not valid any more")},()=>toast("Could not unsubscribe. Please try again."));
  dg.showModal();return}
 sb.rpc("rec_restore",{tok:m[2]}).then(r=>{const d=r.data;
  if(r.error||!d||!d.ok)return toast(d&&d.reason=="paid"?"This order is already paid. Thank you!":"This link has expired or is not valid. Your shop is still here.");
  whenReady(()=>{put(KEY,d.cart_id);mem=d.cart_id;const custom=[];let missing=0;quiet=true;
   C=[];(d.items||[]).forEach(it=>{const p=S.P.find(x=>x.id==it.product_id),vi=p?p.v.findIndex(v=>v.id==it.variant_id):-1;
    if(vi<0||p.v[vi].s<=0){missing++;return}
    if(p.cu){custom.push(p);return}
    C.push({pid:p.id,vi,q:Math.min(it.qty,p.v[vi].s),files:[],raw:[],note:""})});
   last=snap();cartBtn();quiet=false;
   if(custom.length){toast("Please add your photos again for "+custom[0].name);openB(custom[0].id)}
   else if(C.length){window.openCart();if(missing)toast("Some items are no longer available")}
   else toast("Those items are no longer available")})
 },()=>toast("Could not restore your cart. Please try again."));
})();
