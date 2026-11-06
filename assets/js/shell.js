/* BrandGuard app shell: sidebar navigation, role switcher, theme toggle, toasts, drawer, modal and per-user draft storage.
   Every app page calls BG.shell.start({...}) with its own render function. */
(function(){
'use strict';
var BG=window.BG=window.BG||{};
var E=BG.engine,esc=E.esc;

var ICON={
  review:'<path d="M12 3l7 3v5c0 5-3.4 8.2-7 10-3.6-1.8-7-5-7-10V6l7-3z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  workflow:'<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="6" rx="1.5"/>',
  rules:'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M8 7h7M8 11h5"/>',
  insights:'<path d="M4 20V11M10 20V4M16 20v-7M22 20H2"/>',
  about:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  shield:'<path d="M12 3l7 3v5c0 5-3.4 8.2-7 10-3.6-1.8-7-5-7-10V6l7-3z"/><path d="M9 12l2.2 2.2L15.5 10"/>'
};
function svg(n,cls){return '<svg class="'+(cls||'')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+ICON[n]+'</svg>';}
var NAV=[['review','Review','review.html'],['workflow','Workflow','workflow.html'],['rules','Brand rules','rules.html'],['insights','Insights','insights.html'],['about','About','about.html']];
var ROLES=['Creator','Reviewer','Admin'];
var ctxOpts=null;

/* ---------- theme ---------- */
function toggleTheme(){
  var cur=document.documentElement.getAttribute('data-theme');
  var dark=cur?cur==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;
  var next=dark?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  try{localStorage.setItem('bg.theme',next);}catch(e){}
}

/* ---------- ui helpers ---------- */
var UI=BG.ui={
  toast:function(msg){
    var w=document.getElementById('toasts');if(!w)return;
    var t=document.createElement('div');t.className='toast';t.textContent=msg;w.appendChild(t);
    setTimeout(function(){t.remove();},4200);
  },
  drawer:function(html){
    var d=document.getElementById('drawer'),s=document.getElementById('scrim');
    d.innerHTML='<div class="row" style="justify-content:flex-end;margin-bottom:6px"><button class="btn ghost sm" data-ui="close">Close</button></div>'+html;
    d.classList.add('on');s.classList.add('on');
  },
  closeDrawer:function(){document.getElementById('drawer').classList.remove('on');document.getElementById('scrim').classList.remove('on');document.getElementById('modal').classList.remove('on');},
  modal:function(html){
    var m=document.getElementById('modal'),s=document.getElementById('scrim');
    m.innerHTML=html;m.classList.add('on');s.classList.add('on');
    var f=m.querySelector('input,select,textarea');if(f)f.focus();
  },
  closeModal:function(){document.getElementById('modal').classList.remove('on');if(!document.getElementById('drawer').classList.contains('on'))document.getElementById('scrim').classList.remove('on');},
  statusPill:function(s){
    var k=s==='Approved'?'ok':s==='In review'?'brand':s==='Changes requested'?'medium':'neutral';
    return '<span class="pill '+k+'">'+esc(s)+'</span>';
  }
};

/* ---------- per-user draft in progress ---------- */
BG.session={
  key:function(){return 'bg.session.v3.'+((BG.store.user&&BG.store.user.uid)||'anon');},
  load:function(){try{var r=localStorage.getItem(this.key());if(r){var s=JSON.parse(r);if(s&&typeof s.text==='string')return s;}}catch(e){}return E.freshSession();},
  save:function(s){try{localStorage.setItem(this.key(),JSON.stringify(s));}catch(e){}}
};

/* ---------- shell ---------- */
function userCard(u){
  var initial=esc((u.name||'?').charAt(0).toUpperCase());
  return '<div class="who"><div class="avatar">'+initial+'</div><div><b>'+esc(u.name)+'</b><span class="small muted">'+(BG.store.mode==='firebase'?esc(u.email||'Signed in'):'Demo workspace')+'</span></div></div>'+
    '<div class="field"><label for="roleSel">Acting as</label>'+(
      BG.store.mode==='firebase'
        ?'<div class="current-role">'+esc(u.role)+'</div>'
        :'<select id="roleSel">'+ROLES.map(function(r){return '<option'+(r===u.role?' selected':'')+'>'+r+'</option>';}).join('')+'</select>'
    )+'</div>'+
    '<div class="row"><button class="btn sm ghost" data-ui="theme">Theme</button><button class="btn sm ghost" data-ui="signout">Sign out</button></div>';
}
function buildNav(page){
  var inReview=BG.store.docs.filter(function(d){return d.status==='In review';}).length;
  return NAV.map(function(n){
    return '<a class="navitem" href="'+n[2]+'"'+(n[0]===page?' aria-current="page"':'')+'>'+svg(n[0])+'<span>'+n[1]+'</span>'+(n[0]==='workflow'&&inReview?'<span class="count">'+inReview+'</span>':'')+'</a>';
  }).join('');
}
function paintChrome(){
  var u=BG.store.user,page=ctxOpts.page;
  document.getElementById('navlist').innerHTML=buildNav(page);
  document.getElementById('usercard').innerHTML=userCard(u);
  var mu=document.getElementById('mobileUser');
  if(mu)mu.innerHTML=BG.store.mode==='firebase'
    ?'<span class="top-user"><span>'+esc(u.name||'User')+'</span><small>'+esc(u.role||'')+'</small></span>'
    :'<select id="roleSelM" aria-label="Acting as">'+ROLES.map(function(r){return '<option'+(r===u.role?' selected':'')+'>'+r+'</option>';}).join('')+'</select>';
  var bm=document.getElementById('modeBadge');
  bm.textContent=BG.store.mode==='firebase'?'Live: Firebase':'Local demo';
  bm.className='badge-mode'+(BG.store.mode==='firebase'?' live':'');
  var nb=document.getElementById('note');
  if(BG.store.note){nb.hidden=false;nb.textContent=BG.store.note;}else nb.hidden=true;
}

BG.shell={
  can:function(){var r=BG.store.user?BG.store.user.role:'Creator';return {edit:r!=='Reviewer',approve:r!=='Creator',admin:r==='Admin',role:r};},
  refresh:function(){paintChrome();},
  start:function(opts){
    ctxOpts=opts;
    return BG.store.init().then(function(user){
      if(!user){location.replace('login.html');return;}
      document.body.innerHTML=
        '<div class="app">'+
          '<aside class="rail"><a class="logo" href="index.html">'+svg('shield')+'BrandGuard</a><nav class="navlist" id="navlist" aria-label="App"></nav><div class="usercard" id="usercard"></div></aside>'+
          '<div class="main">'+
            '<header class="topbar"><div><h1>'+esc(opts.title)+'</h1><div class="sub">'+esc(opts.sub||'')+'</div></div>'+
              '<div class="right"><span id="mobileUser" class="mobile-user"></span><span class="top-profile"><span class="top-profile-avatar">'+esc((user.name||'?').charAt(0).toUpperCase())+'</span><span><b>'+esc(user.name||'User')+'</b><small>'+esc(user.role||'')+'</small></span></span><span id="modeBadge" class="badge-mode"></span><span id="topActions"></span></div></header>'+
            '<div id="note" class="banner" hidden></div>'+
            '<div class="content" id="page"></div>'+
            '<footer class="appfoot"><div><b>AI use disclosure.</b> Rule checks run in your browser. The optional Gemini deep check sends the draft and the rule list to Google. Gemini never edits or approves anything: a person accepts, edits or disputes every finding.</div>'+
            '<div>Powered by Google Gemini for CodeNexus India 2026. The brand pack, facts and sample history are fictional demo data.</div></footer>'+
          '</div>'+
        '</div>'+
        '<div class="scrim" id="scrim"></div><aside class="drawer" id="drawer" aria-label="Details"></aside><div class="modal" id="modal" role="dialog" aria-modal="true"></div><div class="toast-wrap" id="toasts" role="status" aria-live="polite"></div>';
      paintChrome();
      BG.store.subscribe(function(){paintChrome();if(opts.onData)opts.onData();});
      document.addEventListener('keydown',function(e){if(e.key==='Escape')UI.closeDrawer();});
      document.addEventListener('click',function(e){
        var el=e.target.closest('[data-ui]');
        if(el){
          var a=el.dataset.ui;
          if(a==='close')UI.closeDrawer();
          if(a==='theme')toggleTheme();
          if(a==='signout')BG.store.signOut().then(function(){location.href='login.html';});
          if(a==='closeModal')UI.closeModal();
          return;
        }
        if(e.target.id==='scrim'){UI.closeDrawer();}
      });
      document.addEventListener('change',function(e){
        if(e.target.id==='roleSel'||e.target.id==='roleSelM'){
          BG.store.setRole(e.target.value).then(function(){
            paintChrome();if(opts.onRole)opts.onRole();if(opts.onData)opts.onData();
            UI.toast(BG.store.mode==='firebase'?'Roles are controlled by Firebase in live mode.':'Now acting as '+e.target.value+'.');
          });
        }
      });
      return BG.ai.init().then(function(){return opts.onReady(user);});
    });
  }
};
})();
