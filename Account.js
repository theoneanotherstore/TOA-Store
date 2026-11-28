/* Customer accounts: sign up, log in, edit details. New accounts appear in the admin Customers screen.
   Uses the shop's existing Supabase client (sb). Loaded with defer. */
(function(){
 "use strict";
 var s=typeof sb!=="undefined"?sb:null,btn=document.getElementById("acctBtn");
 if(!s||!btn)return;
 var E=function(v){return String(v==null?"":v).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})};
 var user=null,info=null,mode="up";

 var st=document.createElement("style");
 st.textContent="#acct h3{font:500 24px Roboto,sans-serif;margin:0 0 4px}#acct .ac-tabs{display:flex;gap:8px;margin:14px 0}"+
  "#acct .ac-tabs button{flex:1;padding:9px 12px}#acct .ac-tabs button.on{background:var(--ink);color:#fff}"+
  "#acct form{display:grid;gap:10px}#acct input{width:100%;font:400 16px Roboto,sans-serif;padding:12px 14px;border:1.5px solid var(--ln);border-radius:12px;background:#fff;color:var(--ink)}"+
  "#acct input:focus{outline:2px solid var(--o);border-color:var(--o)}#acct .ac-er{color:#b42318;font-size:14px;min-height:18px}"+
  "#acct .ac-ok{color:#067647;font-size:14px}#acct .ac-lk{background:none;border:0;padding:0;text-decoration:underline;color:var(--mut);font-size:14px}"+
  "#acct .ac-x{position:absolute;right:14px;top:12px;border:0;padding:4px 10px;font-size:22px;line-height:1}"+
  "#acct .ac-card{background:var(--peach);border-radius:14px;padding:14px 16px;margin:12px 0}"+
  "#acct .ac-ck{display:flex;gap:8px;align-items:flex-start;font-size:14px;color:var(--mut)}#acct .ac-ck input{width:auto;margin-top:3px}"+
  "#acct .ac-code{text-align:center;font-size:26px;letter-spacing:.4em;font-weight:500}#acct .ac-row{display:flex;justify-content:space-between;gap:10px}";
 document.head.appendChild(st);

 var ICON=btn.innerHTML;   /* the person icon from the page */
 var dlg=document.createElement("dialog");dlg.id="acct";dlg.setAttribute("aria-label","Your account");document.body.appendChild(dlg);

 function first(){return((info&&info.name)||(user&&user.user_metadata&&user.user_metadata.name)||"").split(" ")[0]}
 function paint(){
  if(user){btn.innerHTML='<span class="av">'+E((first()||(user.email||"?")).charAt(0))+'</span>';btn.setAttribute("aria-label","Your account");btn.title="Your account"}else{btn.innerHTML=ICON;btn.setAttribute("aria-label","Sign in or create account");btn.title="Account"}
  var n=(info&&info.name)||(user&&user.user_metadata&&user.user_metadata.name)||"";
  window.TOA_ACCOUNT=user?{name:n,email:user.email||"",phone:(info&&info.phone)||(user.user_metadata&&user.user_metadata.phone)||""}:null}
 function loadInfo(){
  if(!user){info=null;paint();return Promise.resolve()}
  return s.from("customer_accounts").select("name,phone,email").eq("id",user.id).maybeSingle().then(function(r){info=r&&r.data||null;paint()},function(){paint()})}
 function setUser(u){user=u||null;paint();loadInfo()}

 s.auth.getSession().then(function(r){setUser(r&&r.data&&r.data.session&&r.data.session.user)},function(){});
 s.auth.onAuthStateChange(function(ev,sess){
  setUser(sess&&sess.user)});

 function shell(inner){dlg.innerHTML='<button class="ac-x" type="button" aria-label="Close" id="ac-x">×</button>'+inner;document.getElementById("ac-x").onclick=function(){dlg.close()}}
 function msg(id,t,ok){var el=document.getElementById(id);if(el){el.className=ok?"ac-ok":"ac-er";el.textContent=t||""}}
 function nice(m){m=String(m||"");
  if(/already registered|already been registered/i.test(m))return"This email already has an account. Please log in.";
  if(/invalid login/i.test(m))return"Wrong email or password.";
  if(/not confirmed/i.test(m))return"Please confirm your email first. Check your inbox.";
  if(/password/i.test(m)&&/(least|short|weak)/i.test(m))return"Choose a stronger password (at least 8 characters).";
  if(/rate limit|too many/i.test(m))return"Too many tries. Please wait a few minutes and try again.";
  if(/failed to fetch|network/i.test(m))return"Network problem. Check your internet and try again.";
  return m||"Something went wrong. Please try again."}
 var SITEKEY="";   /* PLACEHOLDER: Cloudflare Turnstile site key (public). Leave empty until TURNSTILE_SECRET is set on Supabase. */
 var PHONE=/^(\+91|91|0)?[6-9][0-9]{9}$/,pend=null,tick=null,cap={id:null,tok:""};
 var tel=function(v){return String(v||"").replace(/\D/g,"").slice(-10)};

 /* calls the wa-otp Edge Function and always resolves to {data} or {error:"readable text"} */
 function call(body){
  return s.functions.invoke("wa-otp",{body:body}).then(function(r){
   if(!r.error)return{data:r.data};
   var c=r.error.context;
   if(c&&typeof c.json==="function")return c.json().then(function(j){return{error:(j&&j.error)||nice(r.error.message)}},function(){return{error:nice(r.error.message)}});
   return{error:nice(r.error.message)}},function(err){return{error:nice(err&&err.message)}})}

 function mountCaptcha(){
  cap.tok="";var box=document.getElementById("ac-cf");if(!SITEKEY||!box)return;
  function r(){cap.id=window.turnstile.render(box,{sitekey:SITEKEY,callback:function(t){cap.tok=t},"expired-callback":function(){cap.tok=""}})}
  if(window.turnstile)return r();
  var sc=document.createElement("script");sc.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";sc.async=true;sc.onload=r;document.head.appendChild(sc)}
 function resetCaptcha(){cap.tok="";try{if(window.turnstile&&cap.id!=null)window.turnstile.reset(cap.id)}catch(_){}}

 /* step 1: name/phone/email (sign up) or phone (log in), then we send the WhatsApp code */
 function openAuth(){
  clearInterval(tick);var up=mode==="up";
  shell('<h3>'+(up?"Create your account":"Welcome back")+'</h3><p class="mut">'+(up?"We will send a 6-digit code to your WhatsApp to confirm your number.":"Enter your mobile number and we will send a code on WhatsApp.")+'</p>'+
   '<div class="ac-tabs"><button type="button" data-m="up" class="'+(up?"on":"")+'">Create account</button><button type="button" data-m="in" class="'+(!up?"on":"")+'">Log in</button></div>'+
   '<form id="ac-f" novalidate>'+(up?
    '<input id="ac-n" autocomplete="name" placeholder="Full name" maxlength="100" required><input id="ac-p" type="tel" inputmode="numeric" autocomplete="tel" placeholder="10-digit WhatsApp number" maxlength="16" required><input id="ac-e" type="email" autocomplete="email" placeholder="Email" maxlength="200" required><label class="ac-ck"><input type="checkbox" id="ac-mk"><span>Send me offers on WhatsApp (optional). Reply STOP any time to stop.</span></label>':
    '<input id="ac-p" type="tel" inputmode="numeric" autocomplete="tel" placeholder="10-digit WhatsApp number" maxlength="16" required>')+
   '<div id="ac-cf"></div><div id="ac-m" class="ac-er" role="alert"></div><button class="pri" id="ac-go" type="submit">Send WhatsApp code</button></form>');
  dlg.querySelectorAll("[data-m]").forEach(function(b){b.onclick=function(){mode=b.dataset.m;openAuth()}});
  mountCaptcha();
  var go=document.getElementById("ac-go");
  document.getElementById("ac-f").onsubmit=function(ev){ev.preventDefault();
   var p=document.getElementById("ac-p").value.replace(/[\s-]/g,"");
   if(!PHONE.test(p))return msg("ac-m","Enter a valid 10-digit Indian mobile number.");
   var d={purpose:up?"signup":"login",phone:tel(p)};
   if(up){
    d.name=document.getElementById("ac-n").value.trim();d.email=document.getElementById("ac-e").value.trim().toLowerCase();d.marketing=document.getElementById("ac-mk").checked;
    if(d.name.length<2)return msg("ac-m","Enter your name.");
    if(!/^\S+@\S+\.\S+$/.test(d.email))return msg("ac-m","Enter a valid email.")}
   if(SITEKEY&&!cap.tok)return msg("ac-m","Please complete the check above.");
   go.disabled=true;msg("ac-m","");
   call(Object.assign({action:"send",captcha:cap.tok},d)).then(function(r){
    go.disabled=false;resetCaptcha();
    if(r.error)return msg("ac-m",r.error);
    pend=d;openCode(false)})}}

 /* step 2: enter the 6-digit code */
 function openCode(resent){
  clearInterval(tick);
  shell('<h3>Enter the code</h3><p class="mut">We sent a 6-digit code to WhatsApp on +91 '+E(pend.phone)+'. It expires in 5 minutes.</p>'+
   '<form id="ac-f" novalidate><input id="ac-c" class="ac-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······" aria-label="6-digit code"><div id="ac-cf"></div><div id="ac-m" class="'+(resent?"ac-ok":"ac-er")+'" role="alert">'+(resent?"A new code was sent.":"")+'</div>'+
   '<button class="pri" id="ac-go" type="submit">Verify</button><div class="ac-row"><button type="button" class="ac-lk" id="ac-rs" disabled>Resend code</button><button type="button" class="ac-lk" id="ac-ch">Change number</button></div></form>');
  mountCaptcha();
  var go=document.getElementById("ac-go"),c=document.getElementById("ac-c"),rs=document.getElementById("ac-rs"),left=30;
  c.focus();
  function t(){rs.disabled=left>0;rs.textContent=left>0?"Resend code in "+left+"s":"Resend code"}
  t();tick=setInterval(function(){if(!document.getElementById("ac-rs")){clearInterval(tick);return}left--;t();if(left<=0)clearInterval(tick)},1000);
  document.getElementById("ac-ch").onclick=function(){openAuth()};
  rs.onclick=function(){
   if(SITEKEY&&!cap.tok)return msg("ac-m","Please complete the check above first.");
   rs.disabled=true;
   call(Object.assign({action:"send",captcha:cap.tok},pend)).then(function(r){
    if(r.error){resetCaptcha();rs.disabled=false;return msg("ac-m",r.error)}
    openCode(true)})};
  c.oninput=function(){c.value=c.value.replace(/\D/g,"").slice(0,6);if(c.value.length===6&&!go.disabled)go.click()};
  document.getElementById("ac-f").onsubmit=function(ev){ev.preventDefault();
   if(!/^\d{6}$/.test(c.value))return msg("ac-m","Enter the 6-digit code.");
   go.disabled=true;msg("ac-m","");
   call({action:"verify",purpose:pend.purpose,phone:pend.phone,code:c.value}).then(function(r){
    if(r.error){go.disabled=false;return msg("ac-m",r.error)}
    return s.auth.verifyOtp({token_hash:r.data.token_hash,type:"magiclink"}).then(function(v){
     if(v.error){go.disabled=false;return msg("ac-m","Could not log you in. Please try again.")}
     clearInterval(tick);var nm=(pend.name||"").split(" ")[0];
     done(pend.purpose==="signup"&&nm?"Your account is ready, "+nm+".":"You're logged in.")})},function(){go.disabled=false;msg("ac-m","Network problem. Check your internet and try again.")})}}
 function done(t){
  shell('<h3>'+E(t)+'</h3><p class="mut" style="margin:10px 0 16px">Your name, email and phone will be filled in at checkout.</p><button class="pri" type="button" id="ac-ok">Continue shopping</button>');
  document.getElementById("ac-ok").onclick=function(){dlg.close()}}

 function openProfile(){
  var n=(info&&info.name)||(user.user_metadata&&user.user_metadata.name)||"",p=(info&&info.phone)||(user.user_metadata&&user.user_metadata.phone)||"";
  shell('<h3>Your account</h3><div class="ac-card"><b>'+E(n||"Customer")+'</b><br><span class="mut">'+E(user.email||"")+'</span></div>'+
   '<form id="ac-f" novalidate><input id="ac-n" autocomplete="name" placeholder="Full name" maxlength="100" value="'+E(n)+'"><input id="ac-p" type="tel" autocomplete="tel" placeholder="10-digit mobile number" maxlength="16" value="'+E(p)+'" readonly title="Your number is verified on WhatsApp and cannot be changed here"><div id="ac-m" class="ac-er" role="alert"></div><button class="pri" type="submit" id="ac-go">Save details</button></form>'+
   '<p style="margin-top:14px"><button type="button" id="ac-lo">Log out</button></p>');
  document.getElementById("ac-lo").onclick=function(){s.auth.signOut().then(function(){dlg.close()})};
  document.getElementById("ac-f").onsubmit=function(ev){ev.preventDefault();
   var nn=document.getElementById("ac-n").value.trim(),pp=document.getElementById("ac-p").value.replace(/[\s-]/g,"");
   if(nn.length<2)return msg("ac-m","Enter your name.");
   var go=document.getElementById("ac-go");go.disabled=true;
   Promise.all([s.from("customer_accounts").update({name:nn}).eq("id",user.id),s.auth.updateUser({data:{name:nn}})]).then(function(r){
    go.disabled=false;var er=r[0].error||r[1].error;if(er)return msg("ac-m",nice(er.message));
    info=Object.assign({},info,{name:nn});paint();msg("ac-m","Saved.",true)},function(err){go.disabled=false;msg("ac-m",nice(err&&err.message))})}}

 btn.onclick=function(){if(user)openProfile();else{mode="up";openAuth()}if(!dlg.open)dlg.showModal()};
 dlg.addEventListener("click",function(e){if(e.target===dlg)dlg.close()});
 paint();
})();
