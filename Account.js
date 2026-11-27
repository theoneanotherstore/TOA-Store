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
  "#acct .ac-card{background:var(--peach);border-radius:14px;padding:14px 16px;margin:12px 0}";
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
  setUser(sess&&sess.user);
  if(ev==="PASSWORD_RECOVERY")setTimeout(openNewPw,0)});

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
 var PHONE=/^(\+91|91|0)?[6-9][0-9]{9}$/;

 function openAuth(){
  shell('<h3>'+(mode==="up"?"Create your account":"Welcome back")+'</h3><p class="mut">'+(mode==="up"?"Save your details so checkout is quicker next time.":"Log in to your account.")+'</p>'+
   '<div class="ac-tabs"><button type="button" data-m="up" class="'+(mode==="up"?"on":"")+'">Create account</button><button type="button" data-m="in" class="'+(mode==="in"?"on":"")+'">Log in</button></div>'+
   (mode==="up"?
    '<form id="ac-f" novalidate><input id="ac-n" autocomplete="name" placeholder="Full name" maxlength="100" required><input id="ac-p" type="tel" autocomplete="tel" placeholder="10-digit mobile number" maxlength="16" required><input id="ac-e" type="email" autocomplete="email" placeholder="Email" maxlength="200" required><input id="ac-w" type="password" autocomplete="new-password" placeholder="Password (at least 8 characters)" minlength="8" maxlength="72" required><div id="ac-m" class="ac-er" role="alert"></div><button class="pri" id="ac-go" type="submit">Create account</button></form>':
    '<form id="ac-f" novalidate><input id="ac-e" type="email" autocomplete="email" placeholder="Email" maxlength="200" required><input id="ac-w" type="password" autocomplete="current-password" placeholder="Password" maxlength="72" required><div id="ac-m" class="ac-er" role="alert"></div><button class="pri" id="ac-go" type="submit">Log in</button><button type="button" class="ac-lk" id="ac-fp">Forgot password?</button></form>'));
  dlg.querySelectorAll("[data-m]").forEach(function(b){b.onclick=function(){mode=b.dataset.m;openAuth()}});
  var f=document.getElementById("ac-f"),go=document.getElementById("ac-go");
  if(mode==="in"){document.getElementById("ac-fp").onclick=function(){
    var e=document.getElementById("ac-e").value.trim();if(!/^\S+@\S+\.\S+$/.test(e))return msg("ac-m","Enter your email above first.");
    s.auth.resetPasswordForEmail(e,{redirectTo:location.origin+location.pathname}).then(function(r){msg("ac-m",r.error?nice(r.error.message):"If that email has an account, a reset link is on its way.",!r.error)})}}
  f.onsubmit=function(ev){ev.preventDefault();
   var e=document.getElementById("ac-e").value.trim(),w=document.getElementById("ac-w").value;
   if(!/^\S+@\S+\.\S+$/.test(e))return msg("ac-m","Enter a valid email.");
   if(mode==="up"){
    var n=document.getElementById("ac-n").value.trim(),p=document.getElementById("ac-p").value.replace(/[\s-]/g,"");
    if(n.length<2)return msg("ac-m","Enter your name.");
    if(!PHONE.test(p))return msg("ac-m","Enter a valid 10-digit Indian mobile number.");
    if(w.length<8)return msg("ac-m","Password must be at least 8 characters.");
    go.disabled=true;msg("ac-m","");
    s.auth.signUp({email:e,password:w,options:{data:{account_type:"customer",name:n,phone:p}}}).then(function(r){
     go.disabled=false;
     if(r.error)return msg("ac-m",nice(r.error.message));
     var u=r.data&&r.data.user;
     if(u&&(!u.identities||!u.identities.length))return msg("ac-m","This email already has an account. Please log in.");
     if(r.data.session){done("Your account is ready, "+n.split(" ")[0]+".")}
     else{shell('<h3>Check your email</h3><p class="mut" style="margin:10px 0 16px">We sent a confirmation link to '+E(e)+'. Open it, then come back and log in.</p><button class="pri" type="button" id="ac-ok">OK</button>');document.getElementById("ac-ok").onclick=function(){mode="in";openAuth()}}
    },function(err){go.disabled=false;msg("ac-m",nice(err&&err.message))})
   }else{
    if(!w)return msg("ac-m","Enter your password.");
    go.disabled=true;msg("ac-m","");
    s.auth.signInWithPassword({email:e,password:w}).then(function(r){go.disabled=false;if(r.error)return msg("ac-m",nice(r.error.message));done("You're logged in.")},function(err){go.disabled=false;msg("ac-m",nice(err&&err.message))})}};
 }
 function done(t){
  shell('<h3>'+E(t)+'</h3><p class="mut" style="margin:10px 0 16px">Your name, email and phone will be filled in at checkout.</p><button class="pri" type="button" id="ac-ok">Continue shopping</button>');
  document.getElementById("ac-ok").onclick=function(){dlg.close()}}

 function openProfile(){
  var n=(info&&info.name)||(user.user_metadata&&user.user_metadata.name)||"",p=(info&&info.phone)||(user.user_metadata&&user.user_metadata.phone)||"";
  shell('<h3>Your account</h3><div class="ac-card"><b>'+E(n||"Customer")+'</b><br><span class="mut">'+E(user.email||"")+'</span></div>'+
   '<form id="ac-f" novalidate><input id="ac-n" autocomplete="name" placeholder="Full name" maxlength="100" value="'+E(n)+'"><input id="ac-p" type="tel" autocomplete="tel" placeholder="10-digit mobile number" maxlength="16" value="'+E(p)+'"><div id="ac-m" class="ac-er" role="alert"></div><button class="pri" type="submit" id="ac-go">Save details</button></form>'+
   '<p style="margin-top:14px"><button type="button" id="ac-lo">Log out</button></p>');
  document.getElementById("ac-lo").onclick=function(){s.auth.signOut().then(function(){dlg.close()})};
  document.getElementById("ac-f").onsubmit=function(ev){ev.preventDefault();
   var nn=document.getElementById("ac-n").value.trim(),pp=document.getElementById("ac-p").value.replace(/[\s-]/g,"");
   if(nn.length<2)return msg("ac-m","Enter your name.");
   if(!PHONE.test(pp))return msg("ac-m","Enter a valid 10-digit Indian mobile number.");
   var go=document.getElementById("ac-go");go.disabled=true;
   Promise.all([s.from("customer_accounts").update({name:nn,phone:pp}).eq("id",user.id),s.auth.updateUser({data:{name:nn,phone:pp}})]).then(function(r){
    go.disabled=false;var er=r[0].error||r[1].error;if(er)return msg("ac-m",nice(er.message));
    info=Object.assign({},info,{name:nn,phone:pp});paint();msg("ac-m","Saved.",true)},function(err){go.disabled=false;msg("ac-m",nice(err&&err.message))})}}

 function openNewPw(){
  shell('<h3>Set a new password</h3><form id="ac-f" novalidate><input id="ac-w" type="password" autocomplete="new-password" placeholder="New password (at least 8 characters)" minlength="8" maxlength="72"><div id="ac-m" class="ac-er" role="alert"></div><button class="pri" type="submit" id="ac-go">Save password</button></form>');
  document.getElementById("ac-f").onsubmit=function(ev){ev.preventDefault();var w=document.getElementById("ac-w").value;
   if(w.length<8)return msg("ac-m","Password must be at least 8 characters.");
   s.auth.updateUser({password:w}).then(function(r){if(r.error)return msg("ac-m",nice(r.error.message));done("Password updated.")})};
  if(!dlg.open)dlg.showModal()}

 btn.onclick=function(){if(user)openProfile();else{mode="up";openAuth()}if(!dlg.open)dlg.showModal()};
 dlg.addEventListener("click",function(e){if(e.target===dlg)dlg.close()});
 paint();
})();
