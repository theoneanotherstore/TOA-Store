/* Header wishlist star: opens the saved products and shows how many are saved. */
(function(){
 "use strict";
 var b=document.getElementById("wishBtn");if(!b)return;
 function count(){try{var a=JSON.parse(localStorage.getItem("toa-wl")||"[]");return Array.isArray(a)?a.length:0}catch(e){return 0}}
 function paint(){
  var n=count(),c=b.querySelector(".cnt");
  b.classList.toggle("has",n>0);
  if(n){if(!c){c=document.createElement("span");c.className="cnt";b.appendChild(c)}c.textContent=n>99?"99+":n}else if(c)c.remove();
  b.setAttribute("aria-label","Wishlist, "+n+" saved")}
 b.onclick=function(){
  if(typeof setCat==="function")setCat("wish",true);
  else{var g=document.getElementById("shopgrid");if(g)g.scrollIntoView({behavior:"smooth"})}};
 document.addEventListener("click",function(){setTimeout(paint,60)},true);
 window.addEventListener("storage",paint);
 paint();
})();
