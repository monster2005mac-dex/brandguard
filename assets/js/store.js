/* BrandGuard data store.
   Two interchangeable backends behind one API:
     local    localStorage, used when no Firebase config is present (and as a fallback if Firebase fails)
     firebase Firebase Auth + Cloud Firestore (real-time, shared between users)
   Shared data: brand rules, documents, events. Per-person data (the draft in progress) is kept in localStorage. */
(function(){
'use strict';
var BG=window.BG=window.BG||{};
var E=BG.engine;
var cfg=window.BG_CONFIG||{};
var fbc=cfg.firebase||{};
var wantFirebase=!!(fbc.apiKey&&fbc.projectId);

var LS_SHARED='bg.shared.v3',LS_USER='bg.user.v3';
var ADMIN_EMAIL='admin@brandco.in';
var shared=null,subs=[],auth=null,db=null,fbReady=false;
var S=BG.store={mode:wantFirebase?'firebase':'local',user:null,note:'',ready:null};

function emit(){subs.forEach(function(f){try{f();}catch(e){console.error(e);}});}
function clean(x){return JSON.parse(JSON.stringify(x));}
function readLS(k){try{var r=localStorage.getItem(k);return r?JSON.parse(r):null;}catch(e){return null;}}
var memLS={};
function writeLS(k,v){var s=JSON.stringify(v);memLS[k]=s;try{localStorage.setItem(k,s);}catch(e){}}

Object.defineProperties(S,{
  rules:{get:function(){return shared.rules;}},
  docs:{get:function(){return shared.docs;}},
  events:{get:function(){return shared.events;}}
});
S.subscribe=function(fn){subs.push(fn);};

/* ---------- local backend ---------- */
function initLocal(){
  shared=readLS(LS_SHARED)||E.seedAll();
  if(!shared.rules||!shared.docs||!shared.events)shared=E.seedAll();
  S.user=readLS(LS_USER);
  window.addEventListener('storage',function(ev){
    if(ev.key===LS_SHARED){var n=readLS(LS_SHARED);if(n){shared=n;emit();}}
  });
  return Promise.resolve(S.user);
}
function persistLocal(){writeLS(LS_SHARED,shared);}

/* ---------- Firebase backend ---------- */
function loadScript(src){
  return new Promise(function(res,rej){
    var s=document.createElement('script');s.src=src;s.onload=res;s.onerror=function(){rej(new Error('Could not load '+src));};
    document.head.appendChild(s);
  });
}
function initFirebase(){
  var v='10.12.2',base='https://www.gstatic.com/firebasejs/'+v+'/';
  return loadScript(base+'firebase-app-compat.js')
    .then(function(){return Promise.all([loadScript(base+'firebase-auth-compat.js'),loadScript(base+'firebase-firestore-compat.js')]);})
    .then(function(){
      window.firebase.initializeApp(fbc);
      auth=window.firebase.auth();db=window.firebase.firestore();fbReady=true;
      return new Promise(function(res){var un=auth.onAuthStateChanged(function(u){un();res(u);});});
    })
    .then(function(u){return u?attach(u):null;})
    .catch(function(e){
      console.error(e);
      S.mode='local';S.note='Firebase could not start ('+(e&&e.message||e)+'). Running in local demo mode.';
      return initLocal();
    });
}
function attach(u){
  var uref=db.collection('users').doc(u.uid);
  return uref.get().then(function(snap){
    var pending=null;try{pending=sessionStorage.getItem('bg.pendingRole');}catch(e){}
    var d=snap.exists?snap.data():null;
    var isAdmin=(u.email||'').toLowerCase()===ADMIN_EMAIL;
    var role=isAdmin?'Admin':(d&&d.role==='Admin'?((pending==='Creator'||pending==='Reviewer')?pending:'Creator'):(d&&d.role)||pending||'Creator');
    var name=(d&&d.name)||u.displayName||(u.email||'').split('@')[0]||'User';
    S.user={uid:u.uid,name:name,email:u.email||'',role:role};
    return (!d||d.role!==role)?uref.set({name:name,email:u.email||'',role:role,createdAt:(d&&d.createdAt)||new Date().toISOString()},{merge:true}):null;
  }).then(bootstrap).then(listen).then(function(){return S.user;});
}
function bootstrap(){
  var ref=db.collection('brand').doc('rules');
  return ref.get().then(function(s){
    if(s.exists)return null;
    var seed=E.seedAll(),b=db.batch();
    b.set(ref,clean(seed.rules));
    seed.docs.forEach(function(d){b.set(db.collection('docs').doc(d.id),clean(d));});
    seed.events.forEach(function(e,i){b.set(db.collection('events').doc('seed-'+i),clean(e));});
    return b.commit();
  });
}
function listen(){
  shared={rules:E.seedRules(),docs:[],events:[]};
  return new Promise(function(res){
    var got={},need=3;
    function once(k){if(!got[k]){got[k]=1;if(--need===0)res();}}
    function fail(k){return function(e){S.note='Firestore: '+(e&&e.message||e);console.error(e);once(k);emit();};}
    db.collection('brand').doc('rules').onSnapshot(function(snap){if(snap.exists)shared.rules=snap.data();once('r');emit();},fail('r'));
    db.collection('docs').onSnapshot(function(snap){
      shared.docs=snap.docs.map(function(d){return d.data();}).sort(function(a,b){return a.versions[0].at<b.versions[0].at?-1:1;});
      once('d');emit();
    },fail('d'));
    db.collection('events').onSnapshot(function(snap){
      shared.events=snap.docs.map(function(d){return d.data();}).sort(function(a,b){return a.at<b.at?-1:1;});
      once('e');emit();
    },fail('e'));
    setTimeout(function(){need=1;once('timeout');},8000);
  });
}

/* ---------- public API ---------- */
S.init=function(){
  if(!S.ready)S.ready=wantFirebase?initFirebase():initLocal();
  return S.ready;
};
S.saveRules=function(r){
  shared.rules=r;emit();
  if(S.mode==='firebase')return db.collection('brand').doc('rules').set(clean(r)).catch(S._err);
  persistLocal();return Promise.resolve();
};
S.saveDoc=function(d){
  var i=shared.docs.findIndex(function(x){return x.id===d.id;});
  if(i>=0)shared.docs[i]=d;else shared.docs.push(d);
  emit();
  if(S.mode==='firebase')return db.collection('docs').doc(d.id).set(clean(d)).catch(S._err);
  persistLocal();return Promise.resolve();
};
S.addEvent=function(e){
  shared.events.push(e);emit();
  if(S.mode==='firebase')return db.collection('events').add(clean(e)).catch(S._err);
  persistLocal();return Promise.resolve();
};
S.removeSampleEvents=function(ruleId){
  shared.events=shared.events.filter(function(e){return !(e.ruleId===ruleId&&e.sample);});emit();
  if(S.mode==='local')persistLocal();
};
S._err=function(e){S.note='Save failed: '+(e&&e.message||e);console.error(e);emit();};
S.resetDemo=function(){
  if(S.mode==='firebase'){S.note='Reset is only available in local demo mode.';emit();return Promise.resolve();}
  shared=E.seedAll();persistLocal();emit();return Promise.resolve();
};

/* ---------- auth ---------- */
S.enterLocal=function(name,role){
  S.user={uid:'local',name:name||role,email:'',role:role};writeLS(LS_USER,S.user);return Promise.resolve(S.user);
};
S.setRole=function(role){
  if(!S.user)return Promise.resolve();
  if(S.mode==='firebase'){
    S.note='Roles are managed by the workspace administrator in Firebase.';
    emit();
    return Promise.resolve();
  }
  S.user.role=role;
  writeLS(LS_USER,S.user);return Promise.resolve();
};
S.signIn=function(email,pw){return auth.signInWithEmailAndPassword(email,pw).then(function(cred){
  var signedInEmail=(cred.user.email||email||'').toLowerCase();
  if(signedInEmail===ADMIN_EMAIL)return cred;
  return cred;
});};
S.signUp=function(email,pw,name,role){
  role=role==='Reviewer'?'Reviewer':'Creator';
  try{sessionStorage.setItem('bg.pendingRole',role);}catch(e){}
  return auth.createUserWithEmailAndPassword(email,pw).then(function(cred){
    return cred.user.updateProfile({displayName:name}).then(function(){return db.collection('users').doc(cred.user.uid).set({name:name,email:email,role:role,createdAt:new Date().toISOString()});});
  });
};
S.google=function(role){
  try{sessionStorage.setItem('bg.pendingRole',role);}catch(e){}
  return auth.signInWithPopup(new window.firebase.auth.GoogleAuthProvider());
};
S.signOut=function(){
  if(S.mode==='firebase'&&auth)return auth.signOut();
  try{localStorage.removeItem(LS_USER);}catch(e){}
  S.user=null;return Promise.resolve();
};
S.idToken=function(){
  if(S.mode==='firebase'&&auth&&auth.currentUser)return auth.currentUser.getIdToken();
  return Promise.resolve('');
};
})();
