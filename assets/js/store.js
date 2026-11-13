/* BrandGuard data store.
   Two interchangeable backends behind one API:
     local    localStorage demo, used when no Firebase config is present
     firebase Firebase Auth + Cloud Firestore (real-time, shared between users)
   Shared data: brand rules, documents, events. Per-person data (the draft in progress) is kept in localStorage. */
(function(){
'use strict';
var BG=window.BG=window.BG||{};
var E=BG.engine;
var cfg=window.BG_CONFIG||{};
var fbc=cfg.firebase||{};
var DEMO_SESSION='bg.demoMode';
var explicitDemo=false;
try{explicitDemo=sessionStorage.getItem(DEMO_SESSION)==='1';}catch(e){}
var wantFirebase=!!(fbc.apiKey&&fbc.projectId)&&!explicitDemo;

var LS_SHARED='bg.shared.v3',LS_USER='bg.user.v3';
var HINT='bg.hint';
var shared=E.seedAll(),subs=[],auth=null,db=null,persistedRules=null,creatingAccount=false;
var S=BG.store={mode:wantFirebase?'firebase':'local',user:null,workspaceId:'',note:'',ready:null,authReady:false,authError:null};

function clearLegacyLocalData(){
  var CLEANUP='bg.production-clean.v1';
  try{if(localStorage.getItem(CLEANUP))return;}catch(e){}
  try{
    Object.keys(localStorage).forEach(function(k){
      if(k==='bg.shared.v3'||k==='bg.user.v3'||k==='bg.hint'||k==='fake.db'||k==='fake.auth'||k==='fake.accts'||k.indexOf('bg.session.v3.')===0){
        localStorage.removeItem(k);
      }
    });
    localStorage.setItem(CLEANUP,'1');
  }catch(e){}
}
clearLegacyLocalData();

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
function writeLS(k,v){var s=JSON.stringify(v);try{localStorage.setItem(k,s);}catch(e){}}

Object.defineProperties(S,{
  rules:{get:function(){return shared.rules;}},
  docs:{get:function(){return shared.docs;}},
  events:{get:function(){return shared.events;}},
  users:{get:function(){return shared.users||[];}}
});
S.subscribe=function(fn){subs.push(fn);return function(){var index=subs.indexOf(fn);if(index>=0)subs.splice(index,1);};};
S.waitForUser=function(uid){
  return new Promise(function(resolve,reject){
    var unsubscribe,settled=false;
    var timer=setTimeout(function(){
      var timeout=new Error('Firebase signed you in, but workspace membership did not finish loading. Check the user profile and workspace Firestore access, then try again.');
      timeout.code='profile_load_timeout';
      finish(timeout);
    },15000);
    function finish(error,user){
      if(settled)return;
      settled=true;clearTimeout(timer);if(unsubscribe)unsubscribe();
      if(error)reject(error);else resolve(user);
    }
    function check(){
      if(S.authReady&&S.user&&(!uid||S.user.uid===uid)){finish(null,S.user);return;}
      if(S.authError&&(!uid||S.authError.uid===uid))finish(S.authError.error);
    }
    unsubscribe=S.subscribe(check);
    check();
  });
};
S.visibleDocs=function(){
  if(!S.user)return [];
  var role=S.user.role;
  return shared.docs.filter(function(d){return !isLegacySample(d)&&(role==='Reviewer'||role==='Admin'||d.owner===S.user.uid);});
};

function isLegacySample(d){
  return !!(d&&(
    d.sample ||
    /^d-s[123]$/.test(d.id||'') ||
    /Northwind/i.test((d.title||'')+' '+((d.versions&&d.versions[0]&&d.versions[0].text)||'')) ||
    /^(Festive offer email|Launch announcement post|Webinar invite)$/i.test(d.title||'')
  ));
}

/* ---------- local backend ---------- */
function initLocal(){
  shared=readLS(LS_SHARED)||E.seedAll();
  if(!shared.rules||!shared.docs||!shared.events)shared=E.seedAll();
  if(E.validateRules(shared.rules).length)shared=E.seedAll();
  if(/Northwind|fictional demo/i.test(shared.rules.company||''))shared=E.seedAll();
  persistedRules=clean(shared.rules);
  shared.docs=(shared.docs||[]).filter(function(d){return !isLegacySample(d);});
  shared.events=(shared.events||[]).filter(function(e){return !e.sample;});
  persistLocal();
  S.user=readLS(LS_USER);
  S.authReady=!!S.user;
  if(S.user){S.user.uid=localUid(S.user.role);writeLS(LS_USER,S.user);}
  shared.docs.forEach(function(d){if(d.owner==='local')d.owner=localUid('Creator');});
  persistLocal();
  window.addEventListener('storage',function(ev){
    if(ev.key===LS_SHARED){var n=readLS(LS_SHARED);if(n){shared=n;emit();}}
  });
  return Promise.resolve(S.user);
}
function persistLocal(){writeLS(LS_SHARED,shared);}
/* Demo mode: each role is its own person, so a Reviewer can approve what a Creator submitted. */
function localUid(role){return 'local-'+String(role||'Creator').toLowerCase();}

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
      auth=window.firebase.auth();db=window.firebase.firestore();
      return new Promise(function(resolve,reject){
        var initial=true;
        auth.onAuthStateChanged(function(u){
          if(initial){
            initial=false;
            if(u){if(creatingAccount)return;attach(u).then(resolve).catch(function(error){
              S.authError={uid:u.uid,error:error};emit();reject(error);
            });}
            else resolve(null);
            return;
          }
          if(u){
            if(creatingAccount)return;
            S.authReady=false;S.authError=null;
            attach(u).catch(function(error){
              S.authError={uid:u.uid,error:error};emit();console.error(error);
            });
          }
          else {S.authReady=false;S.user=null;S.workspaceId='';setHint();emit();}
        });
      });
    })
    .catch(function(e){
      console.error(e);
      S.note='Firebase could not start ('+(e&&e.message||e)+'). Reload the page or check the Firebase configuration and connection.';
      S.user=null;
      setHint();
      emit();
      throw e;
    });
}
function attach(u){
  S.authReady=false;S.authError=null;
  var uref=db.collection('users').doc(u.uid),pendingName='',inviteToken='';
  try{
    pendingName=sessionStorage.getItem('bg.pendingName')||'';
    inviteToken=sessionStorage.getItem('bg.inviteToken')||'';
    sessionStorage.removeItem('bg.pendingName');
  }catch(e){}
  return uref.get().then(function(snap){
    if(snap.exists)return snap.data();
    if(!inviteToken){
      var missing=new Error('This account is not part of a workspace. Sign in with an invitation link or ask an Admin to invite you.');
      missing.code='invite_required';
      throw missing;
    }
    return S.acceptInvitation(inviteToken,pendingName).then(function(profile){
      try{sessionStorage.removeItem('bg.inviteToken');}catch(e){}
      return profile;
    });
  }).then(function(d){
    if(!d||typeof d.workspaceId!=='string'||!/^ws-[A-Za-z0-9_-]{1,128}$/.test(d.workspaceId)||
      !['Creator','Reviewer','Admin'].includes(d.role)){
      var invalid=new Error('Your workspace membership is invalid. Ask an Admin to resend the invitation.');
      invalid.code='invalid_membership';
      throw invalid;
    }
    S.workspaceId=d.workspaceId;
    S.user={uid:u.uid,name:d.name||u.displayName||'User',email:u.email||d.email||'',role:d.role,photo:d.photo||u.photoURL||'',workspaceId:d.workspaceId};setHint();
  }).then(function(){return bootstrap();}).then(listen).then(function(){
    S.authReady=true;S.authError=null;emit();return S.user;
  }).catch(function(error){
    S.user=null;S.workspaceId='';S.authReady=false;setHint();emit();
    if(auth&&auth.currentUser&&auth.currentUser.uid===u.uid){
      return auth.signOut().catch(function(signOutError){console.error(signOutError);}).then(function(){throw error;});
    }
    throw error;
  });
}
function bootstrap(){
  if(!S.user)return null;
  return db.collection('brandRules').doc(S.user.workspaceId).get().then(function(s){
    if(!s.exists){
      var missing=new Error('Workspace brand rules are missing. Run the documented workspace migration or bootstrap command.');
      missing.code='workspace_not_initialized';
      throw missing;
    }
  });
}
function listen(){
  shared={rules:E.templateRules(),docs:[],events:[],users:[]};
  return new Promise(function(res){
    var got={},need=3;
    function once(k){if(!got[k]){got[k]=1;if(--need===0)res();}}
    function fail(k){return function(e){S.note='Firestore: '+(e&&e.message||e);console.error(e);once(k);emit();};}
    var workspace=S.user.workspaceId;
    db.collection('brandRules').doc(workspace).onSnapshot(function(snap){
      if(snap.exists){
        var rules=snap.data();
        if(S.user.role==='Admin'&&(/Northwind|fictional demo/i.test(rules.company||'')||(Array.isArray(rules.docs)&&rules.docs.some(function(d){return d.sample;})))){
          rules=E.templateRules(S.user.name+"'s company");
          db.collection('brandRules').doc(workspace).set(clean(rules)).catch(S._err);
        }
        shared.rules=rules;
        persistedRules=clean(rules);
      }
      once('r');emit();
    },fail('r'));
    var docsQuery=db.collection('docs').where('workspaceId','==',workspace);
    if(S.user.role==='Creator')docsQuery=docsQuery.where('owner','==',S.user.uid);
    docsQuery.onSnapshot(function(snap){
      shared.docs=snap.docs.map(function(d){var item=d.data();item.id=item.id||d.id;return item;})
        .filter(function(d){return !isLegacySample(d);})
        .filter(function(d){return Array.isArray(d.versions)&&d.versions.length;})
        .sort(function(a,b){return a.versions[0].at<b.versions[0].at?-1:1;});
      if(S.user.role==='Admin')snap.docs.forEach(function(docSnap){
        var data=docSnap.data();
        data.id=data.id||docSnap.id;
        if(isLegacySample(data)){
          db.collection('docs').doc(docSnap.id).delete().catch(function(e){console.error(e);});
        }
      });
      once('d');emit();
    },fail('d'));
    db.collection('events').where('workspaceId','==',workspace).onSnapshot(function(snap){
      shared.events=snap.docs.map(function(d){return d.data();})
        .filter(function(e){return !e.sample;})
        .sort(function(a,b){return a.at<b.at?-1:1;});
      once('e');emit();
    },fail('e'));
    db.collection('users').doc(S.user.uid).onSnapshot(function(snap){
      var d=snap.exists?snap.data():null;
      if(d&&d.role&&d.workspaceId===S.user.workspaceId&&(d.role!==S.user.role||d.workspaceId!==S.workspaceId)){S.user.role=d.role;setHint();location.reload();}
    },function(e){console.error(e);});
    if(S.user.role==='Admin'){
      db.collection('users').where('workspaceId','==',workspace).onSnapshot(function(snap){
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
S.startDemo=function(){
  try{sessionStorage.setItem(DEMO_SESSION,'1');}
  catch(e){return Promise.reject(new Error('The local demo needs session storage enabled in this browser.'));}
  if(S.ready){
    if(S.mode==='local')return S.ready;
    return Promise.reject(new Error('Firebase already started in this tab. Open the demo link in a new tab.'));
  }
  S.mode='local';
  S.ready=Promise.resolve().then(initLocal).then(function(u){setHint();return u;});
  return S.ready;
};
S.saveRules=function(r){
  var next=clean(r);
  delete next.gemini;
  if(shared.rules.initialAdmin)next.initialAdmin=shared.rules.initialAdmin;
  var errors=E.validateRules(next);
  if(errors.length)return Promise.reject(new Error('Brand pack is invalid: '+errors[0]));
  var previous=clean(persistedRules||shared.rules);
  shared.rules=next;emit();
  if(S.mode==='firebase')return db.collection('brandRules').doc(S.user.workspaceId).set(clean(next)).then(function(){
    persistedRules=clean(next);
  }).catch(function(e){
    shared.rules=previous;emit();return S._err(e);
  });
  persistedRules=clean(next);
  persistLocal();return Promise.resolve();
};
S.saveDoc=function(d){
  if(S.mode==='firebase'&&S.user){d.owner=d.owner||S.user.uid;d.workspaceId=S.user.workspaceId;}
  if(S.mode==='firebase'&&new Blob([JSON.stringify(d)]).size>850000){
    return Promise.reject(new Error('This document is too large to save safely in Firestore. Export the review report and continue in a new document.'));
  }
  var i=shared.docs.findIndex(function(x){return x.id===d.id;});
  var previous=i>=0?JSON.parse(JSON.stringify(shared.docs[i])):null;
  if(i>=0)shared.docs[i]=d;else shared.docs.push(d);
  emit();
  if(S.mode==='firebase')return db.collection('docs').doc(d.id).set(clean(d)).catch(function(e){
    if(previous)shared.docs[i]=previous;else shared.docs=shared.docs.filter(function(x){return x.id!==d.id;});
    emit();
    return S._err(e);
  });
  persistLocal();return Promise.resolve();
};
S.approveDoc=function(id,version,visualConfirmed){
  if(S.mode!=='firebase'||!S.user)return Promise.reject(new Error('Server-verified approval requires a signed-in Firebase account.'));
  return S.idToken().then(function(token){
    var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},30000);
    return fetch(cfg.approvalEndpoint||'/api/approve',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({docId:id,version:version,visualConfirmed:visualConfirmed===true}),signal:controller.signal
    }).finally(function(){clearTimeout(timeout);});
  }).then(function(response){
    return response.json().catch(function(){return {};}).then(function(body){
      if(!response.ok)throw new Error(body.error||'Server verification failed. Reload and try again.');
      return body;
    });
  });
};
S.deleteDoc=function(id){
  var d=shared.docs.find(function(x){return x.id===id;});
  if(!d)return Promise.resolve();
  if(S.mode==='firebase'&&S.user.role!=='Admin'&&(d.owner!==S.user.uid||d.status==='Approved'||d.status==='In review')){
    return Promise.reject(new Error('Only Draft or Changes-requested documents owned by you can be deleted.'));
  }
  var copy=JSON.parse(JSON.stringify(d));
  shared.docs=shared.docs.filter(function(x){return x.id!==id;});
  emit();
  if(S.mode==='firebase')return db.collection('docs').doc(id).delete().catch(function(e){
    shared.docs.push(copy);emit();return S._err(e);
  });
  persistLocal();return Promise.resolve();
};
S.addEvent=function(e){
  if(S.mode==='firebase'&&S.user)e.workspaceId=S.user.workspaceId;
  shared.events.push(e);emit();
  if(S.mode==='firebase')return db.collection('events').add(clean(e)).catch(function(error){
    shared.events=shared.events.filter(function(item){return item!==e;});emit();return S._err(error);
  });
  persistLocal();return Promise.resolve();
};
S.removeSampleEvents=function(ruleId){
  shared.events=shared.events.filter(function(e){return !(e.ruleId===ruleId&&e.sample);});emit();
  if(S.mode==='local')persistLocal();
};
S._err=function(e){S.note='Save failed: '+(e&&e.message||e);console.error(e);emit();throw e;};
S.resetDemo=function(){
  if(S.mode==='firebase'){S.note='Reset is only available in local demo mode.';emit();return Promise.resolve();}
  shared=E.seedAll();persistLocal();emit();return Promise.resolve();
};

/* ---------- auth ---------- */
S.enterLocal=function(name,role){
  S.user={uid:localUid(role),name:name||role,email:'',role:role,photo:''};S.authReady=true;writeLS(LS_USER,S.user);setHint();return Promise.resolve(S.user);
};
S.setRole=function(role){
  if(!S.user)return Promise.resolve();
  if(S.mode==='firebase'){
    S.note='Roles are managed by the workspace administrator in Firebase.';
    emit();
    return Promise.resolve();
  }
  S.user.role=role;S.user.uid=localUid(role);
  writeLS(LS_USER,S.user);setHint();return Promise.resolve();
};
S.setUserRole=function(uid,role){
  if(S.mode!=='firebase'||!S.user||S.user.role!=='Admin')return Promise.resolve();
  if(!(S.users||[]).some(function(user){return user.uid===uid&&user.workspaceId===S.user.workspaceId;}))return Promise.reject(new Error('That person is not a member of this workspace.'));
  if(uid===S.user.uid&&role!=='Admin'){
    var admins=(shared.users||[]).filter(function(u){return u.role==='Admin';}).length;
    if(admins<2){S.note='You are the only Admin. Make someone else an Admin before changing your own role.';emit();return Promise.resolve();}
  }
  return db.collection('users').doc(uid).update({role:role}).catch(S._err);
};
S.signIn=function(email,pw){S.authError=null;return auth.signInWithEmailAndPassword(email,pw);};
S.signUp=function(email,pw,name,role,returnUrl){
  var invite='';
  try{invite=sessionStorage.getItem('bg.inviteToken')||'';}catch(e){}
  if(!invite)return Promise.reject({code:'invite_required',message:'An active workspace invitation is required to create an account.'});
  try{sessionStorage.setItem('bg.pendingName',name||'');}catch(e){}
  try{sessionStorage.removeItem('bg.pendingRole');}catch(e){}
  creatingAccount=true;
  var created=false;
  return auth.createUserWithEmailAndPassword(email,pw).then(function(cred){
    created=true;
    return cred.user.updateProfile({displayName:name}).then(function(){
      return cred.user.sendEmailVerification({url:returnUrl});
    }).then(function(){
      return auth.signOut().then(function(){creatingAccount=false;return {email:email,verificationSent:true};});
    });
  }).catch(function(error){
    var cleanup=created&&auth.currentUser?auth.signOut():Promise.resolve();
    return cleanup.catch(function(signOutError){console.error(signOutError);}).then(function(){
      creatingAccount=false;
      throw error;
    });
  });
};
S.google=function(){
  S.authError=null;
  return auth.signInWithPopup(new window.firebase.auth.GoogleAuthProvider());
};
S.signOut=function(){
  try{localStorage.removeItem(HINT);}catch(e){}
  var uid=S.user&&S.user.uid;
  S.user=null;S.authReady=false;S.authError=null;
  try{if(uid)localStorage.removeItem('bg.session.v3.'+uid);}catch(e){}
  try{sessionStorage.removeItem('bg.selDoc');sessionStorage.removeItem('bg.openDoc');}catch(e){}
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
    var cur=auth&&auth.currentUser,previous=u.photo;
    u.photo=url||(cur&&cur.photoURL)||'';
    setHint();emit();
    return db.collection('users').doc(u.uid).set({photo:url||''},{merge:true}).catch(function(e){
      u.photo=previous;setHint();emit();return S._err(e);
    });
  }
  u.photo=url||'';writeLS(LS_USER,u);setHint();emit();return Promise.resolve();
};
S.idToken=function(){
  if(S.mode==='firebase'&&auth&&auth.currentUser)return auth.currentUser.getIdToken();
  return Promise.resolve('');
};
function invitationRequest(body){
  if(S.mode!=='firebase'||!auth||!auth.currentUser)return Promise.reject(new Error('A signed-in Firebase account is required.'));
  return auth.currentUser.getIdToken().then(function(token){
    return fetch(cfg.invitationEndpoint||'/api/invitations',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)
    });
  }).then(function(response){
    return response.json().catch(function(){return {};}).then(function(result){
      if(!response.ok){var error=new Error(result.error||'Invitation request failed.');error.code=result.code;throw error;}
      return result;
    });
  });
}
S.createInvitation=function(email,role){return invitationRequest({action:'create',email:email,role:role}).then(function(result){return result.url;});};
S.acceptInvitation=function(token,name){return invitationRequest({action:'accept',token:token,name:name||''}).then(function(result){return result.profile;});};
})();
