/* BrandGuard 3D effects. Pure progressive enhancement: the site works without this file.
   - scroll progress bar, pointer parallax for the hero scene, card tilt + spotlight
   - extruded 3D shield, rotating rule cube, count-up numbers
   - photo loader: tries your own file in assets/img first, then a hosted fallback, else shows the gradient frame */
(function(){
'use strict';
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var fine=window.matchMedia&&matchMedia('(hover: hover) and (pointer: fine)').matches;
function $(s,r){return (r||document).querySelector(s);}
function $$(s,r){return [].slice.call((r||document).querySelectorAll(s));}

/* ---- photos: data-srcs="local.jpg|https://fallback" ---- */
$$('img[data-srcs]').forEach(function(img){
  var list=img.getAttribute('data-srcs').split('|').filter(Boolean),i=0;
  function next(){
    if(i>=list.length){img.remove();return;}
    img.src=list[i++];
  }
  img.addEventListener('load',function(){img.classList.add('ok');});
  img.addEventListener('error',next);
  next();
});

/* ---- scroll progress ---- */
var bar=$('.progress');
if(bar){
  var tick=false;
  function upd(){tick=false;var h=document.documentElement,max=h.scrollHeight-h.clientHeight;bar.style.transform='scaleX('+(max>0?Math.min(1,h.scrollTop/max):0)+')';}
  window.addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(upd);}},{passive:true});
  upd();
}

/* ---- extruded 3D shield: stack copies of the SVG along Z ---- */
$$('.shield3d').forEach(function(box){
  var src=box.querySelector('svg');if(!src)return;
  var N=11;
  for(var i=0;i<N;i++){
    var c=src.cloneNode(true);
    c.setAttribute('aria-hidden','true');
    var z=(i-(N-1)/2)*2.4,front=i===N-1;
    c.style.transform='translateZ('+z+'px)';
    c.style.opacity=front?1:.9;
    c.style.filter=front?'none':'brightness('+(0.55+i*0.03)+')';
    if(front)c.classList.add('front');
    box.insertBefore(c,src);
  }
  src.remove();
});

/* ---- hero scene: pointer parallax ---- */
var stage=$('#stage'),scene=$('#scene');
if(stage&&scene&&!reduce&&fine){
  var tx=0,ty=0,cx=0,cy=0,run=false,vis=true;
  function loop(){
    cx+=(tx-cx)*.09;cy+=(ty-cy)*.09;
    stage.style.setProperty('--rx',(7-cy*9).toFixed(2)+'deg');
    stage.style.setProperty('--ry',(-13+cx*15).toFixed(2)+'deg');
    if(vis&&(Math.abs(tx-cx)>.001||Math.abs(ty-cy)>.001))requestAnimationFrame(loop);else run=false;
  }
  function kick(){if(!run&&vis){run=true;requestAnimationFrame(loop);}}
  window.addEventListener('pointermove',function(e){
    tx=(e.clientX/window.innerWidth-.5)*2;ty=(e.clientY/window.innerHeight-.5)*2;kick();
  },{passive:true});
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(en){vis=en[0].isIntersecting;if(vis)kick();}).observe(scene);
  }
}

/* ---- tilt + spotlight ---- */
$$('[data-tilt],[data-glow]').forEach(function(el){
  var tilt=el.hasAttribute('data-tilt')&&fine&&!reduce;
  el.addEventListener('pointermove',function(e){
    var r=el.getBoundingClientRect(),px=(e.clientX-r.left)/r.width,py=(e.clientY-r.top)/r.height;
    el.style.setProperty('--mx',(px*100).toFixed(1)+'%');el.style.setProperty('--my',(py*100).toFixed(1)+'%');
    if(tilt){el.classList.add('hot');el.style.setProperty('--tx',((py-.5)*-9).toFixed(2)+'deg');el.style.setProperty('--ty',((px-.5)*11).toFixed(2)+'deg');}
  });
  el.addEventListener('pointerleave',function(){el.classList.remove('hot');el.style.setProperty('--tx','0deg');el.style.setProperty('--ty','0deg');});
});

/* ---- rule cube ---- */
var cube=$('#cube');
if(cube){
  var faces=$$('.face',cube),btns=$$('#cubeNav button'),idx=0,timer=null,held=false;
  function go(i){
    idx=(i+faces.length)%faces.length;
    cube.style.setProperty('--cy',(-90*idx)+'deg');
    btns.forEach(function(b,k){b.setAttribute('aria-pressed',k===idx?'true':'false');});
  }
  btns.forEach(function(b,k){b.addEventListener('click',function(){go(k);restart();});});
  function restart(){
    clearInterval(timer);
    if(!reduce)timer=setInterval(function(){if(!held&&!document.hidden)go(idx+1);},4800);
  }
  var host=cube.parentNode;
  host.addEventListener('pointerenter',function(){held=true;});
  host.addEventListener('pointerleave',function(){held=false;});
  host.addEventListener('focusin',function(){held=true;});
  host.addEventListener('focusout',function(){held=false;});
  /* drag / swipe to turn */
  var sx=null;
  host.addEventListener('pointerdown',function(e){sx=e.clientX;});
  window.addEventListener('pointerup',function(e){
    if(sx===null)return;var d=e.clientX-sx;sx=null;
    if(Math.abs(d)>40){go(idx+(d<0?1:-1));restart();}
  });
  go(0);restart();
}

/* ---- count-up ---- */
var nums=$$('[data-count]');
function fmt(el,v){el.textContent=(el.getAttribute('data-pre')||'')+Math.round(v)+(el.getAttribute('data-suf')||'');}
function count(el){
  var to=parseFloat(el.getAttribute('data-count')),t0=null,dur=1100;
  if(reduce||!to){fmt(el,to);return;}
  function step(t){if(t0===null)t0=t;var p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3);fmt(el,to*e);if(p<1)requestAnimationFrame(step);}
  requestAnimationFrame(step);
}
if('IntersectionObserver' in window&&nums.length){
  var io=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){count(x.target);io.unobserve(x.target);}});},{threshold:.5});
  nums.forEach(function(n){io.observe(n);});
}else nums.forEach(function(n){fmt(n,parseFloat(n.getAttribute('data-count')));});
})();
