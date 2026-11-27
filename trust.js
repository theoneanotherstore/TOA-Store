/* Section 5: trust and conversion. Loaded with defer, after the main script. */
(function(){
 var WA="917397193050",IG="https://www.instagram.com/theoneanother.in";
 var $=function(i){return document.getElementById(i)};
 var E=function(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})};
 var say=function(m){typeof toast=="function"?toast(m):alert(m)};
 var db=function(){return typeof sb!="undefined"&&sb?sb:null};
 var stars=function(n){return"★★★★★".slice(0,n)+"☆☆☆☆☆".slice(0,5-n)};
 var hero=document.getElementById("intro")||document.querySelector(".hero"),shopgrid=$("shopgrid"),about=$("about"),faq=$("faq");

 /* 1. Trust strip under the hero */
 if(hero)hero.insertAdjacentHTML("afterend",'<section id="trustbar"><div class="t5-row"><span class="t5-chip">🔒 <b>Secure Razorpay payment</b></span><span class="t5-chip">✔ <b>Payment confirmed instantly</b></span><span class="t5-chip">📸 <b>Photos checked on WhatsApp</b></span><span class="t5-chip">🚚 <b>5–7 working days</b></span><button type="button" class="t5-chip" id="t5-tr1">Track your order</button></div></section>');

 /* 2. Recently viewed (under the shop) */
 if(shopgrid)shopgrid.insertAdjacentHTML("afterend",'<section class="t5s" id="t5-recent" hidden><div class="hd"><div><span class="eyebrow">Pick up where you left off</span><h2>Recently viewed</h2></div></div><div class="t5-rv" id="t5-rvg"></div></section>');

 /* 3. Reviews and Instagram gallery (after Our story) */
 if(about)about.insertAdjacentHTML("afterend",
  '<section class="t5s" id="reviews"><div class="hd"><div><span class="eyebrow">Reviews</span><h2>What customers <span class="sf" style="color:var(--o)">say</span></h2></div><div class="t5-avg" id="t5-avg"></div></div><div class="t5-rg" id="t5-rg"></div><p class="t5-empty" id="t5-none" hidden>No reviews yet. Bought something from us? Be the first to share how it went.</p><p style="margin-top:22px"><button type="button" id="t5-wr">Write a review</button></p>'+
  '<form class="t5-form" id="t5-form" hidden><input id="t5-n" placeholder="Your name" maxlength="60" required><div class="t5-pick" id="t5-pick" role="radiogroup" aria-label="Rating"></div><textarea id="t5-b" rows="3" maxlength="600" placeholder="How was your order?" required minlength="5"></textarea><button class="pri" style="font-size:15px">Send review</button><p class="mut">Reviews appear on the site after we approve them.</p></form><p class="t5-ok" id="t5-thx" hidden>Thank you! Your review will show up once we approve it.</p></section>'+
  '<section class="t5s" id="t5-insta" hidden><div class="hd"><div><span class="eyebrow">Instagram</span><h2>From <span class="sf" style="color:var(--o)">our feed</span></h2></div><a class="btn" href="'+IG+'" target="_blank" rel="noopener">Follow @theoneanother.in</a></div><div class="t5-gal" id="t5-gal"></div></section>');

 /* 4. Shipping, returns and payment policies, right before the FAQ */
 if(faq)faq.insertAdjacentHTML("beforebegin",'<section class="t5s" id="policies"><div class="hd"><div><span class="eyebrow">Policies</span><h2>Shipping, returns <span class="sf" style="color:var(--o)">and payment</span></h2></div></div><div class="t5-pol"><div><span class="t5-ico">🚚</span><h3>Shipping</h3><p>Delivered across India in 5–7 working days, counted from when we confirm your photos and payment.</p></div><div><span class="t5-ico">↩️</span><h3>Returns</h3><p>Custom products are non-refundable and non-returnable. If something arrives damaged or wrong, message us on WhatsApp straight away.</p></div><div><span class="t5-ico">🔒</span><h3>Payment</h3><p>Pay by UPI directly to us. We verify your payment before anything is printed.</p></div><div><span class="t5-ico">🧾</span><h3>Minimum order</h3><p class="t5-min">The minimum order is ₹249.</p></div></div></section>');

 /* 5. Floating WhatsApp support */
 var w=document.createElement("a");w.id="waFloat";w.target="_blank";w.rel="noopener";w.href="https://wa.me/"+WA+"?text="+encodeURIComponent("Hi theoneanother, I have a question.");
 w.setAttribute("aria-label","Chat with us on WhatsApp");
 w.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4V5z"/></svg><span>Chat with us</span>';document.body.appendChild(w);

 /* 6. Footer link to order tracking */
 var fl=document.querySelectorAll("footer .fl");if(fl[1])fl[1].insertAdjacentHTML("beforeend",'<a href="#" id="t5-tr2">Track your order</a>');

 /* ---- Reviews ---- */
 var rate=5,pick=$("t5-pick");
 function drawPick(){if(!pick)return;pick.innerHTML=[1,2,3,4,5].map(function(n){return'<button type="button" class="'+(n<=rate?"on":"")+'" data-r="'+n+'" role="radio" aria-checked="'+(n==rate)+'" aria-label="'+n+' star'+(n>1?"s":"")+'">★</button>'}).join("")}
 drawPick();
 if(pick)pick.onclick=function(e){var b=e.target.closest("[data-r]");if(b){rate=+b.dataset.r;drawPick()}};
 if($("t5-wr"))$("t5-wr").onclick=function(){var f=$("t5-form");f.hidden=!f.hidden;if(!f.hidden)$("t5-n").focus()};
 if($("t5-form"))$("t5-form").onsubmit=function(e){e.preventDefault();var s=db();if(!s)return say("Store is not connected yet");var btn=e.target.querySelector(".pri");btn.disabled=true;
  s.from("reviews").insert({name:$("t5-n").value.trim(),rating:rate,body:$("t5-b").value.trim()}).then(function(r){btn.disabled=false;
   if(r.error)return say("Could not send your review. Please try again.");
   e.target.reset();e.target.hidden=true;rate=5;drawPick();$("t5-thx").hidden=false},function(){btn.disabled=false;say("Could not send your review. Please try again.")})};
 function loadReviews(){var s=db();if(!s)return;
  s.from("reviews").select("name,rating,body").eq("approved",true).order("id",{ascending:false}).limit(12).then(function(r){
   var L=r.error?[]:(r.data||[]);$("t5-none").hidden=L.length>0;
   if(L.length){var avg=L.reduce(function(a,x){return a+x.rating},0)/L.length;
    $("t5-avg").innerHTML='<b>'+avg.toFixed(1)+'</b><span class="t5-st">'+stars(Math.round(avg))+'</span><span class="mut">'+L.length+(L.length==1?" review":" reviews")+'</span>'}
   $("t5-rg").innerHTML=L.map(function(x){return'<article class="t5-rc"><span class="t5-st" aria-label="'+x.rating+' out of 5">'+stars(x.rating)+'</span><p>'+E(x.body)+'</p><small>— '+E(x.name)+'</small></article>'}).join("")},function(){})}

 /* ---- Instagram gallery (rows in the gallery table) ---- */
 function loadGallery(){var s=db();if(!s)return;
  s.from("gallery").select("image,caption").eq("active",true).order("position").order("id").limit(8).then(function(r){
   var L=r.error?[]:(r.data||[]);$("t5-insta").hidden=!L.length;if(!L.length)return;
   $("t5-gal").innerHTML=L.map(function(x){var u=s.storage.from("product-images").getPublicUrl(x.image).data.publicUrl;return'<a href="'+IG+'" target="_blank" rel="noopener"><img src="'+E(u)+'" alt="'+E(x.caption||"theoneanother on Instagram")+'" loading="lazy"></a>'}).join("")},function(){})}

 /* ---- Order tracking ---- */
 function openTrack(e){if(e)e.preventDefault();var d=$("dg");if(!d)return;d.className="";
  d.innerHTML='<h3 style="font:500 26px Roboto,sans-serif">Track your order</h3><p class="mut" style="margin-top:6px">Enter your order ID and the UTR, payment ID or tracking ID we sent you on WhatsApp or email.</p><form class="f" id="t5-tf"><input id="t5-on" placeholder="Order number (e.g. TOA-1001)" required><input id="t5-op" placeholder="UTR / payment ID / tracking ID" required minlength="6" maxlength="60" autocomplete="off"><button class="pri" style="font-size:15px">Track order</button><button type="button" id="t5-x">Close</button></form><div id="t5-res"></div>';
  $("t5-x").onclick=function(){d.close()};
  $("t5-tf").onsubmit=function(ev){ev.preventDefault();var s=db(),res=$("t5-res");if(!s)return say("Store is not connected yet");var b=ev.target.querySelector(".pri");b.disabled=true;res.innerHTML="";
   var trackError=function(){res.innerHTML='<p class="mut" style="margin-top:14px">We could not retrieve tracking right now. Check your connection and try again, or <a target="_blank" rel="noopener" href="https://wa.me/'+WA+'?text='+encodeURIComponent("Hi theoneanother, I need help tracking my order.")+'">message us on WhatsApp</a>.</p>'};
   s.rpc("track_order2",{num:$("t5-on").value.trim(),ref:$("t5-op").value.trim()}).then(function(r){b.disabled=false;
    if(r.error){trackError();return}
    var o=r.data;if(!o){res.innerHTML='<p class="mut" style="margin-top:14px">We could not find that order. Check the order ID and your UTR, payment ID or tracking ID, or message us on WhatsApp.</p>';return}
    var fd=function(t){return t?new Date(t).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):""};
    var S4=["pending","confirmed","shipped","delivered"],i=S4.indexOf(o.status);
    var h='<h4 style="margin-top:18px;font-size:17px">'+E(o.number)+' · placed '+fd(o.placed)+'</h4>';
    h+=o.status=="cancelled"?'<p style="margin-top:8px"><b>This order was cancelled.</b> Message us on WhatsApp if you have questions.</p>':'<div class="t5-steps">'+S4.map(function(x,k){return'<span class="'+(k<=i?"on":"")+'">'+x+'</span>'}).join("")+'</div><p class="mut">Payment: '+(o.paid?"received":"not received yet")+'</p>'+(o.shipped?'<p class="mut">Shipped '+fd(o.shipped)+'</p>':"")+(o.delivered?'<p class="mut">Delivered '+fd(o.delivered)+'</p>':"");
    if(o.courier||o.tracking)h+='<p style="margin-top:8px">'+(o.courier?'Courier: <b>'+E(o.courier)+'</b><br>':"")+(o.tracking?'Tracking number: <b>'+E(o.tracking)+'</b>':"")+'</p>';
    h+='<p style="margin-top:14px"><a class="btn" target="_blank" rel="noopener" href="https://wa.me/'+WA+'?text='+encodeURIComponent("Hi theoneanother, about my order "+o.number)+'">Message us on WhatsApp</a></p>';
    res.innerHTML=h},function(){b.disabled=false;trackError()})};
  d.showModal()}
 window.openTrack=openTrack;if(location.hash=="#orders")setTimeout(function(){openTrack()},400);

 /* ---- Your orders (email + phone) ---- */
 function openOrders(e){if(e)e.preventDefault();var d=$("dg");if(!d)return;d.className="";
  d.innerHTML='<h3 style="font:500 26px Roboto,sans-serif">Your orders</h3><p class="mut" style="margin-top:6px">Enter the email and phone number you ordered with.</p><form class="f" id="t5-of"><input id="t5-oe" type="email" placeholder="Email" required maxlength="200"><input id="t5-oph" type="tel" placeholder="Phone number" required pattern="[0-9+ ]{10,15}"><button class="pri" style="font-size:15px">View orders</button><button type="button" id="t5-ox">Close</button></form><div id="t5-ores"></div>';
  $("t5-ox").onclick=function(){d.close()};
  $("t5-of").onsubmit=function(ev){ev.preventDefault();var s=db(),res=$("t5-ores");if(!s)return say("Store is not connected yet");var b=ev.target.querySelector(".pri");b.disabled=true;res.innerHTML="";
   s.rpc("my_orders",{em:$("t5-oe").value.trim(),ph:$("t5-oph").value.trim()}).then(function(r){b.disabled=false;
    if(r.error)return say("Orders are not available right now. Please message us on WhatsApp.");
    var L=r.data||[];if(!L.length){res.innerHTML='<p class="mut" style="margin-top:14px">No orders found for these details.</p>';return}
    var fd=function(t){return t?new Date(t).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):""},S4=["pending","confirmed","shipped","delivered"];
    res.innerHTML=L.map(function(o){var i=S4.indexOf(o.status);
     var its=(o.items||[]).map(function(x){return E(x.n)+(x.v&&x.v!="Each"?" – "+E(x.v):"")+" × "+x.q}).join(", ");
     return'<div style="margin-top:16px;padding-top:14px;border-top:1px solid #eee"><b>'+E(o.number)+'</b> · '+fd(o.placed)+' · '+inr(o.total)+'<p class="mut">'+its+'</p>'+(o.status=="cancelled"?'<p><b>Cancelled</b></p>':'<div class="t5-steps">'+S4.map(function(x,k){return'<span class="'+(k<=i?"on":"")+'">'+x+'</span>'}).join("")+'</div>')+(o.tracking?'<p class="mut">'+(o.courier?E(o.courier)+' · ':"")+'Tracking ID: <b>'+E(o.tracking)+'</b></p>':"")+'</div>'}).join("")},function(){b.disabled=false;say("Orders are not available right now. Please message us on WhatsApp.")})};
  d.showModal()}
 window.openOrders=openOrders;
 ["t5-tr1","t5-tr2"].forEach(function(id){var n=$(id);if(n)n.onclick=openTrack});

 /* ---- Recently viewed ---- */
 var KEY="toa-rv",rv=[];try{rv=JSON.parse(localStorage.getItem(KEY)||"[]")}catch(e){}
 function remember(id){id=+id;rv=[id].concat(rv.filter(function(x){return x!=id})).slice(0,8);try{localStorage.setItem(KEY,JSON.stringify(rv))}catch(e){}}
 function drawRecent(){if(typeof S=="undefined"||!S.P)return;
  var L=rv.map(function(id){return S.P.find(function(p){return p.id==id})}).filter(Boolean).slice(0,6);
  $("t5-recent").hidden=!L.length;
  $("t5-rvg").innerHTML=L.map(function(p){return'<a data-rid="'+p.id+'">'+art(p)+'<b>'+E(p.name)+'</b><span class="mut">From '+from(p)+'</span></a>'}).join("")}
 if($("t5-rvg"))$("t5-rvg").onclick=function(e){var a=e.target.closest("[data-rid]");if(!a)return;var p=S.P.find(function(x){return x.id==a.dataset.rid});if(!p)return;p.cu?openB(p.id):openP(p.id)};
 ["openP","openB"].forEach(function(n){var o=window[n];if(typeof o!="function")return;window[n]=function(id){remember(id);var r=o.apply(this,arguments);drawRecent();return r}});

 /* Refresh the live parts whenever the shop (re)draws its data */
 function live(){drawRecent();loadReviews();loadGallery();var m=$("policies")&&typeof S!="undefined"&&S.set&&S.set.min;if(m)document.querySelector(".t5-min").textContent="The minimum order is ₹"+Number(m).toLocaleString("en-IN")+"."}
 if(typeof window.shop=="function"){var os=window.shop;window.shop=function(){var r=os.apply(this,arguments);live();return r}}
 if(typeof S!="undefined"&&S.P&&S.P.length)live();else{loadReviews();loadGallery()}
})();
