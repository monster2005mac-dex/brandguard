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
var HINT='bg.hint';
var shared=null,subs=[],auth=null,db=null,fbReady=false;
var S=BG.store={mode:wantFirebase?'firebase':'local',user:null,note:'',ready:null};

/* Small, non-secret copy of who is signed in. Lets the landing page and the app show the right
   state instantly, before Firebase has finished starting. It is only a hint: Firebase Auth stays the authority. */
function homeFor(role){return role==='Admin'?'rules.html':'workflow.html';}
function setHint(){
  try{
    if(S.user)localStorage.setItem(HINT,JSON.stringify({name:S.user.name||'',photo:S.user.photo||'',role:S.user.role||'',email:S.user.email||'',home:homeFor(S.user.role)}));
    else localStorage.removeItem(HINT);
  }catch(e){}
}
function emit(){subs.forEach(function(f){try{f();}catch(e){console.error(e);}});}
function clean(x){return JSON.parse(JSON.stringify(x));}
function readLS(k){try{var r=localStorage.getItem(k);return r?JSON.parse(r):null;}catch(e){return null;}}
var memLS={};
function writeLS(k,v){var s=JSON.stringify(v);memLS[k]=s;try{localStorage.setItem(k,s);}catch(e){}}

Object.defineProperties(S,{
  rules:{get:function(){return shared.rules;}},
  docs:{get:function(){return shared.docs;}},
  events:{get:function(){return shared.events;}},
  users:{get:function(){return shared.users||[];}}
});
S.subscribe=function(fn){subs.push(fn);};
S.visibleDocs=function(){
  if(!S.user)return [];
  var role=S.user.role;
  if(role==='Reviewer'||role==='Admin')return shared.docs.slice();
  return shared.docs.filter(function(d){return d.owner===S.user.uid;});
};

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
      return new Promise(function(res){
        var initial=true;
        auth.onAuthStateChanged(function(u){
          if(initial){
            initial=false;
            if(u){attach(u).then(function(){res(u);}).catch(function(e){console.error(e);res(null);});}
            else res(null);
            return;
          }
          if(u){attach(u).catch(function(e){console.error(e);});}
          else {S.user=null;setHint();emit();}
        });
      });
    })
    .catch(function(e){
      console.error(e);
      S.mode='local';S.note='Firebase could not start ('+(e&&e.message||e)+'). Running in local demo mode.';
      return initLocal();
    });
}
function attach(u){
  var uref=db.collection('users').doc(u.uid);
  return uref.get().then(function(snap){
    var d=snap.exists?snap.data():null;
    if(d)return d;
    /* New account. The very first one (no workspace yet) becomes Admin; everyone else is a Creator.
       The security rules enforce this, so it cannot be faked from the browser. */
    var pendingName=null;try{pendingName=sessionStorage.getItem('bg.pendingName');sessionStorage.removeItem('bg.pendingName');}catch(e){}
    var rec={name:pendingName||u.displayName||(u.email||'').split('@')[0]||'User',email:u.email||'',createdAt:new Date().toISOString()};
    return db.collection('brand').doc('rules').get().then(function(r){
      rec.role=r.exists?'Creator':'Admin';
      return uref.set(rec).catch(function(){rec.role='Creator';return uref.set(rec);});
    }).then(function(){return rec;});
  }).then(function(d){
    S.user={uid:u.uid,name:d.name||u.displayName||'User',email:u.email||d.email||'',role:d.role||'Creator',photo:d.photo||u.photoURL||''};setHint();
  }).then(function(){return bootstrap();}).then(listen).then(function(){return S.user;});
}
function bootstrap(){
  if(S.user.role!=='Admin')return null;
  var ref=db.collection('brand').doc('rules');
  return ref.get().then(function(s){
    if(s.exists)return null;
    return ref.set(clean(E.templateRules(S.user.name?S.user.name+"'s company":'')));
  });
}
function listen(){
  shared={rules:E.templateRules(),docs:[],events:[],users:[]};
  return new Promise(function(res){
    var got={},need=3;
    function once(k){if(!got[k]){got[k]=1;if(--need===0)res();}}
    function fail(k){return function(e){S.note='Firestore: '+(e&&e.message||e);console.error(e);once(k);emit();};}
    db.collection('brand').doc('rules').onSnapshot(function(snap){if(snap.exists)shared.rules=snap.data();once('r');emit();},fail('r'));
    var docsQuery=db.collection('docs');
    if(S.user.role==='Creator')docsQuery=docsQuery.where('owner','==',S.user.uid);
    docsQuery.onSnapshot(function(snap){
      shared.docs=snap.docs.map(function(d){return d.data();}).sort(function(a,b){return a.versions[0].at<b.versions[0].at?-1:1;});
      once('d');emit();
    },fail('d'));
    db.collection('events').onSnapshot(function(snap){
      shared.events=snap.docs.map(function(d){return d.data();}).sort(function(a,b){return a.at<b.at?-1:1;});
      once('e');emit();
    },fail('e'));
    db.collection('users').doc(S.user.uid).onSnapshot(function(snap){
      var d=snap.exists?snap.data():null;
      if(d&&d.role&&d.role!==S.user.role){S.user.role=d.role;setHint();location.reload();}
    },function(e){console.error(e);});
    if(S.user.role==='Admin'){
      db.collection('users').onSnapshot(function(snap){
        shared.users=snap.docs.map(function(d){var x=d.data();x.uid=d.id;return x;}).sort(function(a,b){return (a.createdAt||'')<(b.createdAt||'')?-1:1;});
        emit();
      },function(e){console.error(e);});
    }
    setTimeout(function(){need=1;once('timeout');},8000);
  });
}

/* ---------- public API ---------- */
S.init=function(){
  if(!S.ready)S.ready=(wantFirebase?initFirebase():initLocal()).then(function(u){setHint();return u;});
  return S.ready;
};
S.saveRules=function(r){
  delete r.gemini;
  shared.rules=r;emit();
  if(S.mode==='firebase')return db.collection('brand').doc('rules').set(clean(r)).catch(S._err);
  persistLocal();return Promise.resolve();
};
S.saveDoc=function(d){
  if(S.mode==='firebase'&&S.user)d.owner=d.owner||S.user.uid;
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
  S.user={uid:'local',name:name||role,email:'',role:role,photo:''};writeLS(LS_USER,S.user);setHint();return Promise.resolve(S.user);
};
S.setRole=function(role){
  if(!S.user)return Promise.resolve();
  if(S.mode==='firebase'){
    S.note='Roles are managed by the workspace administrator in Firebase.';
    emit();
    return Promise.resolve();
  }
  S.user.role=role;
  writeLS(LS_USER,S.user);setHint();return Promise.resolve();
};
S.setUserRole=function(uid,role){
  if(S.mode!=='firebase'||!S.user||S.user.role!=='Admin')return Promise.resolve();
  if(uid===S.user.uid&&role!=='Admin'){
    var admins=(shared.users||[]).filter(function(u){return u.role==='Admin';}).length;
    if(admins<2){S.note='You are the only Admin. Make someone else an Admin before changing your own role.';emit();return Promise.resolve();}
  }
  return db.collection('users').doc(uid).update({role:role}).catch(S._err);
};
/* Replace the brand pack with the fictional Northwind demo brand (Admin only). Docs and events are left alone. */
S.loadSamplePack=function(){
  var r=E.seedRules();return S.saveRules(r);
};
S.signIn=function(email,pw){return auth.signInWithEmailAndPassword(email,pw);};
S.signUp=function(email,pw,name){
  try{sessionStorage.setItem('bg.pendingName',name||'');}catch(e){}
  return auth.createUserWithEmailAndPassword(email,pw).then(function(cred){
    return cred.user.updateProfile({displayName:name}).then(function(){return cred;});
  });
};
S.google=function(){
  return auth.signInWithPopup(new window.firebase.auth.GoogleAuthProvider());
};
S.signOut=function(){
  try{localStorage.removeItem(HINT);}catch(e){}
  S.user=null;
  if(S.mode==='firebase'&&auth)return auth.signOut();
  try{localStorage.removeItem(LS_USER);}catch(e){}
  return Promise.resolve();
};
S.resetPassword=function(email){
  if(S.mode!=='firebase'||!auth)return Promise.reject({message:'Password reset needs Firebase sign-in.'});
  return auth.sendPasswordResetEmail(email);
};
/* Profile photo: a small square JPEG data URL, stored on the user's own document. Empty string resets to the default. */
S.setPhoto=function(url){
  if(!S.user)return Promise.resolve();
  var u=S.user;
  if(S.mode==='firebase'){
    var cur=auth&&auth.currentUser;
    u.photo=url||(cur&&cur.photoURL)||'';
    setHint();emit();
    return db.collection('users').doc(u.uid).set({photo:url||''},{merge:true}).catch(S._err);
  }
  u.photo=url||'';writeLS(LS_USER,u);setHint();emit();return Promise.resolve();
};
S.idToken=function(){
  if(S.mode==='firebase'&&auth&&auth.currentUser)return auth.currentUser.getIdToken();
  return Promise.resolve('');
};
})();
