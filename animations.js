/* Section 4: animations and interactions. Loaded with defer, after the main script. */
(function(){
 var reduce=matchMedia("(prefers-reduced-motion:reduce)").matches;

 /* 1. Scroll-triggered reveal with a small stagger inside each group */
 var SEL=".hd,.ct,.cc,.steps>div,.bst>div,details,.fg>div";
 var io="IntersectionObserver" in window&&!reduce?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in2");io.unobserve(e.target)}})},{threshold:.12}):null;
 function scan(){if(!io)return;document.querySelectorAll(SEL).forEach(function(el){if(el.dataset.sr)return;el.dataset.sr=1;
  var i=Array.prototype.indexOf.call(el.parentElement.children,el);el.style.setProperty("--sd",Math.min(i,6)*70+"ms");el.classList.add("scroll-reveal");io.observe(el)})}
 scan();
 /* Tiles and cards are drawn after the data loads, so watch their containers */
 ["catg","hubgrid","featg","grid"].forEach(function(id){var n=document.getElementById(id);if(n&&"MutationObserver" in window)new MutationObserver(scan).observe(n,{childList:true})});

 /* 2. Cart icon bump when the item count goes up */
 var cb=document.getElementById("cartBtn"),last=0;
 if(cb&&typeof cartBtn=="function"&&typeof C!="undefined"){var orig=cartBtn;
  window.cartBtn=function(){orig();var n=C.reduce(function(a,i){return a+i.q},0);if(n>last&&!reduce){cb.classList.remove("bump");void cb.offsetWidth;cb.classList.add("bump")}last=n};
  last=C.reduce(function(a,i){return a+i.q},0)}

})();
