/* BrandGuard motion helpers: ripple, cursor light, one-time entrance sequence, ring + number reveals,
   jump highlights, smooth theme switch. Progressive enhancement: safe to remove. */
(function(){
'use strict';
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
if(reduce)return;
var fine=window.matchMedia&&matchMedia('(hover: hover) and (pointer: fine)').matches;
var CARDS='.panel,.fcard,.kpi,.dcard,.role-card';
function $(s,r){return (r||document).querySelector(s);}
function $$(s,r){return [].slice.call((r||document).querySelectorAll(s));}

/* ripple on buttons */
document.addEventListener('pointerdown',function(e){
  var b=e.target.closest&&e.target.closest('.btn');
  if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')return;
  var r=b.getBoundingClientRect(),size=Math.max(r.width,r.height)*2,s=document.createElement('span');
  s.className='mo-ripple';
  s.style.cssText='width:'+size+'px;height:'+size+'px;left:'+(e.clientX-r.left-size/2)+'px;top:'+(e.clientY-r.top-size/2)+'px';
  b.appendChild(s);setTimeout(function(){if(s.parentNode)s.remove();},650);
},{passive:true});

/* cursor-following light on cards */
if(fine){
  var raf=0,last=null;
  document.addEventListener('pointermove',function(e){
    last=e;if(raf)return;
    raf=requestAnimationFrame(function(){
      raf=0;var c=last.target.closest&&last.target.closest(CARDS);
      if(!c)return;var r=c.getBoundingClientRect();
      c.style.setProperty('--mx',(last.clientX-r.left)+'px');c.style.setProperty('--my',(last.clientY-r.top)+'px');
    });
  },{passive:true});
}

/* count numbers up once */
function countUp(el){
  var m=/^(\d+)(.*)$/.exec((el.textContent||'').trim());
  if(!m||m[1].length>6)return;
  var to=parseInt(m[1],10),suffix=m[2],t0=performance.now(),dur=900;
  if(to===0)return;
  (function step(t){
    var p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3);
    el.textContent=Math.round(to*e)+suffix;
    if(p<1)requestAnimationFrame(step);
  })(t0);
}

/* entrance + ring handling on the app content area */
var page=document.getElementById('page'),entered=false,lastRing=0;
function enter(){
  if(entered||!page||!page.children.length||page.querySelector('.sk,.boot'))return;
  entered=true;
  [].forEach.call(page.children,function(c,i){c.style.setProperty('--i',Math.min(i,8));});
  page.classList.add('mo-in');
  $$('.kpi b',page).forEach(countUp);
  setTimeout(function(){page.classList.remove('mo-in');},1500);
}
function rings(){
  var now=Date.now();
  $$('.ring:not([data-mo])').forEach(function(r){
    r.setAttribute('data-mo','1');
    /* replay the sweep only if it has been a while: typing re-renders must not flicker it */
    if(now-lastRing<4000)r.classList.add('mo-still');
  });
  lastRing=now;
}
if(page){
  new MutationObserver(function(){enter();rings();}).observe(page,{childList:true,subtree:true});
  enter();rings();
}

/* highlight the card or mark a person jumped to */
document.addEventListener('click',function(e){
  var j=e.target.closest&&e.target.closest('[data-act="jump"]');
  if(!j)return;
  var i=j.getAttribute('data-i');
  setTimeout(function(){
    var card=document.getElementById('card-'+i);
    if(card){card.classList.remove('mo-flash');void card.offsetWidth;card.classList.add('mo-flash');
      setTimeout(function(){card.classList.remove('mo-flash');},1500);}
  },60);
});

/* smooth theme switch */
var root=document.documentElement,tm=0;
new MutationObserver(function(){
  root.classList.add('mo-theme');clearTimeout(tm);tm=setTimeout(function(){root.classList.remove('mo-theme');},600);
}).observe(root,{attributes:true,attributeFilter:['data-theme']});
})();
