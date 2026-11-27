/* Wishlist icon and saved-products dialog. */
(function(){
 "use strict";
 var b=document.getElementById("wishBtn"),dlg=document.getElementById("wl-dialog");
 if(!b||!dlg)return;
 var list=document.getElementById("wl-list"),empty=document.getElementById("wl-empty");
 function read(){try{var a=JSON.parse(localStorage.getItem("toa-wl")||"[]");return Array.isArray(a)?a:[]}catch(e){return[]}}
 function paint(){
  var n=read().length,c=b.querySelector(".cnt");
  b.classList.toggle("has",n>0);
  if(n){if(!c){c=document.createElement("span");c.className="cnt";b.appendChild(c)}c.textContent=n>99?"99+":n}else if(c)c.remove();
  b.setAttribute("aria-label","Wishlist, "+n+" saved")}
 function render(){
  var products=typeof S!="undefined"&&Array.isArray(S.P)?S.P:[],items=read().map(function(id){return products.find(function(p){return String(p.id)===String(id)})}).filter(Boolean);
  list.innerHTML=items.map(function(p){
   var href="index.html?product="+encodeURIComponent(p.id),name=esc(p.name);
   return'<article class="wl-item"><a class="wl-item__image" href="'+href+'" aria-label="View '+name+'">'+art(p)+'</a><div class="wl-item__info"><h3><a href="'+href+'">'+name+'</a></h3><p class="mut">From <b>'+from(p)+'</b></p><button type="button" class="wl-remove" data-wl-remove="'+p.id+'">Remove</button></div></article>'}).join("");
  empty.hidden=items.length>0;
 }
 function save(items){
  try{localStorage.setItem("toa-wl",JSON.stringify(items))}catch(e){if(typeof toast=="function")toast("Wishlist could not be updated in this browser.");return false}
  if(typeof V!="undefined")V.wl=items;
  paint();
  return true;
 }
 b.onclick=function(){render();if(!dlg.open)dlg.showModal()};
 var close=document.getElementById("wl-close");if(close)close.onclick=function(){dlg.close()};
 dlg.addEventListener("click",function(e){
  var remove=e.target.closest("[data-wl-remove]");
  if(remove){var id=remove.getAttribute("data-wl-remove"),items=read().filter(function(x){return String(x)!==String(id)});if(save(items)){if(typeof cards=="function")cards(true);render()}return}
  if(e.target===dlg)dlg.close();
 });
 document.addEventListener("click",function(){setTimeout(paint,60)},true);
 window.addEventListener("storage",function(){var items=read();if(typeof V!="undefined")V.wl=items;paint();if(dlg.open)render();if(typeof cards=="function")cards(true)});
 paint();
})();
