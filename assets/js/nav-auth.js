/* Landing-page navigation state.
   Signed out: the nav shows "Login".  Signed in: it shows the person's photo (or initial) and name, and the link
   goes straight to their workspace, never through the login page.
   It paints instantly from a small local hint, then confirms with Firebase in the background. */
(function(){
'use strict';
var slot=document.getElementById('authSlot');
function esc(t){return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function readHint(){try{var h=JSON.parse(localStorage.getItem('bg.hint')||'null');return h&&typeof h.home==='string'&&/^[a-z]+\.html$/.test(h.home)?h:null;}catch(e){return null;}}
function safePhoto(u){return typeof u==='string'&&/^(https:\/\/|data:image\/)/.test(u)?u:'';}

function paint(h){
  if(slot){
    if(h){
      var name=h.name||h.email||'Account',ph=safePhoto(h.photo);
      slot.innerHTML='<a class="nav-user" href="'+esc(h.home)+'" aria-label="Open your workspace, signed in as '+esc(name)+'">'+
        (ph?'<img class="nu-av" src="'+esc(ph)+'" alt="" referrerpolicy="no-referrer">':'<span class="nu-av" aria-hidden="true">'+esc(name.charAt(0).toUpperCase())+'</span>')+
        '<span class="nu-t"><b>'+esc(name)+'</b><small>'+esc(h.role||'Workspace')+'</small></span></a>';
    }else{
      slot.innerHTML='<a class="btn primary sm" href="login.html">Login</a>';
    }
  }
  [].forEach.call(document.querySelectorAll('[data-cta]'),function(a){
    if(h){a.setAttribute('href',h.home);a.textContent='Open workspace';}
    else{a.setAttribute('href','login.html');a.textContent=a.getAttribute('data-out')||a.textContent;}
  });
}

paint(readHint());

function load(src){return new Promise(function(res,rej){var s=document.createElement('script');s.src=src;s.onload=res;s.onerror=function(){rej(new Error(src));};document.head.appendChild(s);});}
function verify(){
  load('assets/js/firebase-config.js').then(function(){return load('assets/js/engine.js');}).then(function(){return load('assets/js/store.js');})
    .then(function(){return window.BG.store.init();})
    .then(function(){paint(readHint());})
    .catch(function(){
      try{localStorage.removeItem('bg.hint');}catch(e){}
      paint(null);
    });
  /* keep the nav right if the person signs out in another tab */
  window.addEventListener('storage',function(e){if(e.key==='bg.hint')paint(readHint());});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',verify);else verify();
})();
