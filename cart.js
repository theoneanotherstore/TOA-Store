/* Section 8: cart and mini cart. Loaded with defer, after trust.js. */
(function(){
 const $=i=>document.getElementById(i),E=s=>esc(s==null?"":s),money=n=>inr(n),say=m=>toast(m);
 const dg=$("dg"),html=document.documentElement;
 let Q=0,last=0,isOpen=false,eat=false,lastAdded="",SL=[],fileDb=null,storageWarning=false;
 try{SL=JSON.parse(localStorage.getItem("toa-sl")||"[]")}catch(e){}
 const keep=()=>{try{localStorage.setItem("toa-sl",JSON.stringify(SL))}catch(e){}};
 const CART_KEY="toa-cart-v1";
 function openFileDb(){if(fileDb)return fileDb;fileDb=new Promise((resolve,reject)=>{if(!window.indexedDB)return reject(new Error("File storage is unavailable"));const r=indexedDB.open("toa-store",1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains("uploads"))r.result.createObjectStore("uploads",{keyPath:"key"})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error("Could not open file storage"))});return fileDb}
 function saveCart(){
  const saved=C.map(i=>{i.raw=Array.isArray(i.raw)?i.raw:[];i.fileKeys=Array.isArray(i.fileKeys)?i.fileKeys:[];if(i.raw.length)i.fileKeys=i.raw.map((f,n)=>i.fileKeys[n]||crypto.randomUUID());return{pid:i.pid,vi:i.vi,q:i.q,files:i.files||[],fileKeys:i.fileKeys,note:i.note||""}});
  try{localStorage.setItem(CART_KEY,JSON.stringify(saved))}catch(e){say("Your cart could not be saved in this browser. Keep this page open while you shop.");return}
  const hasFiles=saved.some(i=>i.fileKeys.length);if(!hasFiles&&!fileDb)return;
  openFileDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction("uploads","readwrite"),store=tx.objectStore("uploads"),active=new Set();C.forEach(i=>(i.fileKeys||[]).forEach(key=>active.add(key)));const all=store.getAllKeys();all.onsuccess=()=>{const existing=new Set(all.result);C.forEach(i=>(i.raw||[]).forEach((f,n)=>{const key=i.fileKeys[n];active.add(key);if(!existing.has(key))store.put({key,file:f,name:f.name,type:f.type,lastModified:f.lastModified})}));all.result.forEach(key=>{if(!active.has(key))store.delete(key)})};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Could not save photo files"));tx.onabort=()=>reject(tx.error||new Error("Could not save photo files"))})).catch(()=>{if(hasFiles&&!storageWarning){storageWarning=true;say("Your cart is saved, but photo files could not be saved by this browser. Please keep this page open.");}});
 }
 async function restoreCart(){
  let saved;try{saved=JSON.parse(localStorage.getItem(CART_KEY)||"[]")}catch(e){say("Your saved cart could not be read. You can continue shopping.");return}
  if(!Array.isArray(saved)||!saved.length)return;
  let db=null;try{db=await openFileDb()}catch(e){}
  const restored=[];
  for(const item of saved){const p=prod(item.pid),v=p&&p.v[item.vi];if(!v||!Number.isFinite(+item.q)||+item.q<1)continue;const raw=[];
   if(db&&Array.isArray(item.fileKeys)){for(const key of item.fileKeys){const rec=await new Promise(resolve=>{const r=db.transaction("uploads","readonly").objectStore("uploads").get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null)});if(rec&&rec.file)raw.push(new File([rec.file],rec.name,{type:rec.type||"",lastModified:rec.lastModified||Date.now()}))}}
   const files=Array.isArray(item.files)?item.files:[];
   restored.push({pid:p.id,vi:item.vi,q:Math.min(+item.q,v.s),files,raw,note:item.note||"",fileKeys:Array.isArray(item.fileKeys)?item.fileKeys:[],missingFiles:!!p.cu&&(!files.length||raw.length!==files.length)});
  }
  C.splice(0,C.length,...restored);$("cartBtn").innerHTML=ic("bag")+" "+count();last=count();saveCart();
  if(restored.some(i=>i.missingFiles))say("Your cart was restored, but some photo files need to be selected again before checkout.");
 }
 window.restoreCart=restoreCart;
 const prod=id=>S.P.find(p=>p.id==id);
 const rows=()=>C.map((i,k)=>{const p=prod(i.pid);return p&&p.v[i.vi]?{k,i,p,v:p.v[i.vi]}:null}).filter(Boolean);
 const count=()=>C.reduce((a,i)=>a+i.q,0);
 const sub=()=>rows().reduce((a,r)=>a+r.v.p*r.i.q,0);
 const tot=()=>{const s=sub();return{s,t:s}};
 const quiet=()=>{Q=1;cartBtn();Q=0};

 /* ---------- markup ---------- */
 const line=(r,full)=>{const cu=r.p.cu,q=r.i.q;return`<div class="c8-it" data-k="${r.k}"><div class="c8-th">${art(r.p)}</div><div class="c8-in"><b>${E(r.p.name)}</b><span class="mut">${E(r.v.n)} · ${money(r.v.p)}${cu?" · "+(r.p.t=="uno"?"2 PDFs":r.i.files.length+" photo(s)"):""}</span>${cu&&r.i.missingFiles?'<span class="mut">Photo files need to be selected again before checkout.</span>':""}${cu&&r.i.note?`<span class="mut">Note: ${E(r.i.note)}</span>`:""}<div class="c8-q"><div class="c8-qs"><button type="button" data-a="dec" aria-label="Decrease quantity" ${q<=(r.v.m||1)?"disabled":""}>−</button><span aria-live="polite">${q}</span><button type="button" data-a="inc" aria-label="Increase quantity">+</button></div><b>${money(r.v.p*q)}</b></div><div class="c8-ac"><button type="button" class="c8-lk" data-a="rm">Remove</button>${!cu&&full?'<button type="button" class="c8-lk" data-a="sv">Save for later</button>':""}</div></div></div>`};
 const meter=s=>{const m=S.set.min,ok=s>=m;return`<div class="c8-mt"><div class="c8-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${m}" aria-valuenow="${Math.min(s,m)}"><i style="width:${Math.min(100,Math.round(s/m*100))}%"></i></div><p>${ok?"✓ You have reached the minimum order of "+money(m):"Add "+money(m-s)+" more to reach the minimum order of "+money(m)}</p></div>`};
 const sum=t=>`<div class="c8-row"><span>Subtotal</span><b>${money(t.s)}</b></div><div class="c8-row"><span>Delivery</span><b class="c8-free">Free</b></div><div class="c8-row c8-tot"><span>Total</span><b>${money(t.t)}</b></div>`;
 const empty=()=>`<div class="c8-em"><svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="#fff5ec"/><path d="M36 44h48l-4 44H40l-4-44z" fill="#fff" stroke="#17120e" stroke-width="3" stroke-linejoin="round"/><path d="M48 44c0-9 5-15 12-15s12 6 12 15" stroke="#ff6a00" stroke-width="4" stroke-linecap="round"/><circle cx="52" cy="62" r="2.5" fill="#17120e"/><circle cx="68" cy="62" r="2.5" fill="#17120e"/><path d="M53 73c4 4 10 4 14 0" stroke="#17120e" stroke-width="3" stroke-linecap="round"/></svg><h3>Your cart is empty</h3><p class="mut">Add a poster, sticker or polaroid and it will show up here.</p><button type="button" class="pri big" data-go="shop">Continue shopping</button></div>`;
 const savedHTML=()=>{const L=SL.map((s,n)=>{const p=prod(s.pid),v=p&&p.v[s.vi];return p&&v?{n,p,v}:null}).filter(Boolean);return L.length?`<div class="c8-sv"><h4>Saved for later (${L.length})</h4>${L.map(x=>`<div class="c8-it c8-sm" data-n="${x.n}"><div class="c8-th">${art(x.p)}</div><div class="c8-in"><b>${E(x.p.name)}</b><span class="mut">${E(x.v.n)} · ${money(x.v.p)}${x.v.s<=0?" · sold out":""}</span><div class="c8-ac"><button type="button" class="c8-lk" data-s="mv" ${x.v.s<=0?"disabled":""}>Move to cart</button><button type="button" class="c8-lk" data-s="del">Remove</button></div></div></div>`).join("")}</div>`:""};

 /* ---------- mini cart drawer ---------- */
 const dr=document.createElement("aside"),ov=document.createElement("div");
 dr.id="c8-dr";dr.setAttribute("role","dialog");dr.setAttribute("aria-modal","true");dr.setAttribute("aria-label","Your cart");dr.inert=true;
 ov.id="c8-ov";ov.hidden=true;document.body.append(ov,dr);
 const dHead=()=>`<div class="c8-h"><h3>Your cart <span class="mut">(${count()})</span></h3><button type="button" class="c8-x" id="c8-x" aria-label="Close cart">×</button></div>`;
 const dHTML=()=>{const R=rows();if(!R.length)return dHead()+`<div class="c8-body">${empty()}${savedHTML()}</div>`;const t=tot(),ok=t.s>=S.set.min;
  return dHead()+`<div class="c8-body">${lastAdded?`<div class="c8-ad" role="status">✓ <span><b>${E(lastAdded)}</b> added to your cart</span></div>`:""}${R.map(r=>line(r,true)).join("")}${savedHTML()}</div><div class="c8-foot">${meter(t.s)}${sum(t)}<div class="c8-btns"><button type="button" class="pri" data-go="co" ${ok?"":"disabled"}>Checkout</button></div></div>`};
 const paintDr=()=>{const b=dr.querySelector(".c8-body"),y=b?b.scrollTop:0;dr.innerHTML=dHTML();const n=dr.querySelector(".c8-body");if(n)n.scrollTop=y};
 function openDr(pid){const p=pid&&prod(pid);lastAdded=p?p.name:"";eat=!!p;setTimeout(()=>{eat=false},60);dr.innerHTML=dHTML();ov.hidden=false;dr.inert=false;isOpen=true;html.classList.add("lock");
  requestAnimationFrame(()=>requestAnimationFrame(()=>{dr.classList.add("open");ov.classList.add("show")}));setTimeout(()=>{const x=$("c8-x");if(x)x.focus()},120)}
 function closeDr(back){if(!isOpen)return;isOpen=false;dr.classList.remove("open");ov.classList.remove("show");dr.inert=true;html.classList.remove("lock");setTimeout(()=>{if(!isOpen)ov.hidden=true},320);if(back)$("cartBtn").focus()}
 ov.onclick=()=>closeDr(true);
 document.addEventListener("keydown",e=>{if(!isOpen)return;if(e.key=="Escape"){e.preventDefault();closeDr(true)}
  if(e.key=="Tab"){const f=[...dr.querySelectorAll("a,button:not([disabled]),input")].filter(x=>x.offsetParent!==null);if(!f.length)return;const a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement==a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement==z){e.preventDefault();a.focus()}}});

 /* ---------- cart entry points open the right-side drawer ---------- */
 window.openCart=()=>openDr();
 $("cartBtn").onclick=()=>openDr();

 /* ---------- actions ---------- */
 function refresh(sel){if(isOpen)paintDr();if(sel){const n=document.querySelector(sel);if(n&&!n.disabled)n.focus()}}
 function itemAct(e){const b=e.target.closest("[data-a]");if(!b)return false;const it=b.closest("[data-k]");if(!it)return false;
  const k=+it.dataset.k,i=C[k];if(!i)return true;const p=prod(i.pid),v=p&&p.v[i.vi],a=b.dataset.a;let sel="";
  if(a=="inc"){if(!v||i.q+1>v.s){say("Only "+(v?v.s:0)+" in stock");return true}i.q++;sel=`[data-k="${k}"] [data-a="inc"]`}
  else if(a=="dec"){const mn=(v&&v.m)||1;if(i.q<=mn){if(mn>1)say("Minimum "+mn+" pieces for this item");return true}i.q--;sel=`[data-k="${k}"] [data-a="dec"]`}
  else if(a=="rm"){if(!window.confirm("Remove this item from your cart?"))return true;C.splice(k,1)}
  else if(a=="sv"&&p&&!p.cu){SL=SL.filter(s=>!(s.pid==i.pid&&s.vi==i.vi));SL.push({pid:i.pid,vi:i.vi,q:i.q});keep();C.splice(k,1)}
  quiet();refresh(sel);return true}
 function slAct(b){const n=+b.closest("[data-n]").dataset.n,s=SL[n];if(!s)return;
  if(b.dataset.s=="del"){SL.splice(n,1);keep();refresh();return}
  const p=prod(s.pid),v=p&&p.v[s.vi];if(!v||v.s<=0)return say("Sorry, that item is out of stock");
  const ex=C.find(i=>i.pid==s.pid&&i.vi==s.vi);if(ex)ex.q=Math.min(v.s,ex.q+s.q);else C.push({pid:s.pid,vi:s.vi,q:Math.min(s.q,v.s),files:[],raw:[],note:""});
  SL.splice(n,1);keep();quiet();refresh()}
 function checkout(){if(!C.length)return;if(tot().s<S.set.min)return say("Minimum order is "+money(S.set.min));closeDr();
  if(typeof window.openCheckout=="function"){window.openCheckout();return}
  say("Checkout is unavailable right now. Please try again.")}
 function go(a){if(a=="shop"){closeDr();if(dg.open)dg.close();$("shopgrid").scrollIntoView({behavior:"smooth"})}else if(a=="co")checkout()}
 dr.addEventListener("click",e=>{if(e.target.closest("#c8-x"))return closeDr(true);const g=e.target.closest("[data-go]");if(g)return go(g.dataset.go);const sv=e.target.closest("[data-s]");if(sv)return slAct(sv);itemAct(e)});

 /* ---------- add to cart: merge repeats, open the mini cart ---------- */
 const dedupe=()=>{for(let a=0;a<C.length;a++){const x=C[a],p=prod(x.pid);if(!p||p.cu)continue;for(let b=C.length-1;b>a;b--){const y=C[b];if(y.pid==x.pid&&y.vi==x.vi){x.q=Math.min(Math.max(1,p.v[x.vi].s),x.q+y.q);C.splice(b,1)}}}};
 const prev=window.cartBtn;
 window.cartBtn=function(){const pid=C.length?C[C.length-1].pid:0;dedupe();saveCart();prev.apply(this,arguments);const n=count();if(!Q&&n>last)openDr(pid);else if(isOpen)paintDr();last=n};
 last=count();
 /* The drawer already confirms the add, so drop the centre toast for it */
 new MutationObserver(m=>m.forEach(r=>r.addedNodes.forEach(n=>{if(eat&&n.classList&&n.classList.contains("toast")&&n.textContent=="Added to cart")n.remove()}))).observe(document.body,{childList:true});
})();
