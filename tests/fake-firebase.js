/* In-memory stand-in for the Firebase compat SDK, used only by tests/e2e.js (Playwright route injection).
   It does NOT enforce security rules; those are reviewed separately. Shared across pages via localStorage 'fake.db'. */
(function(){
var KEY='fake.db', AUTHK='fake.auth';
function load(){try{return JSON.parse(localStorage.getItem(KEY))||{};}catch(e){return {};}}
function save(d){localStorage.setItem(KEY,JSON.stringify(d));}
var listeners=[];
function notify(){listeners.slice().forEach(function(f){try{f();}catch(e){console.error(e);}});}
window.addEventListener('storage',function(e){if(e.key===KEY)notify();});
function snapDoc(path,d){var data=d[path];return {id:path.split('/').pop(),exists:data!==undefined,data:function(){return data===undefined?undefined:JSON.parse(JSON.stringify(data));}};}
function docRef(path){return {path:path,
  get:function(){return Promise.resolve(snapDoc(path,load()));},
  set:function(v,o){var d=load();d[path]=(o&&o.merge&&d[path])?Object.assign({},d[path],v):JSON.parse(JSON.stringify(v));save(d);notify();return Promise.resolve();},
  update:function(v){var d=load();if(d[path]===undefined)return Promise.reject(new Error('no doc'));d[path]=Object.assign({},d[path],v);save(d);notify();return Promise.resolve();},
  onSnapshot:function(cb){var f=function(){cb(snapDoc(path,load()));};listeners.push(f);setTimeout(f,0);return function(){};}};}
function colRef(name,filters){filters=filters||[];
  function docs(){var d=load(),out=[];Object.keys(d).forEach(function(p){var m=p.split('/');if(m.length===2&&m[0]===name){var ok=filters.every(function(f){return d[p][f[0]]===f[2];});if(ok)out.push(snapDoc(p,d));}});return out;}
  return {doc:function(id){return docRef(name+'/'+id);},
   add:function(v){var id='a'+Date.now()+Math.random().toString(36).slice(2,6);return docRef(name+'/'+id).set(v);},
   where:function(a,op,b){return colRef(name,filters.concat([[a,op,b]]));},
   get:function(){return Promise.resolve({docs:docs()});},
   onSnapshot:function(cb){var f=function(){cb({docs:docs()});};listeners.push(f);setTimeout(f,0);return function(){};}};}
var authCbs=[];
function curUser(){try{return JSON.parse(localStorage.getItem(AUTHK));}catch(e){return null;}}
function mk(u){return u&&Object.assign({},u,{getIdToken:function(){return Promise.resolve('tok-'+u.uid);},updateProfile:function(p){var c=curUser();c.displayName=p.displayName;localStorage.setItem(AUTHK,JSON.stringify(c));var reg=JSON.parse(localStorage.getItem('fake.accts')||'{}');if(reg[c.email])reg[c.email].displayName=p.displayName;localStorage.setItem('fake.accts',JSON.stringify(reg));return Promise.resolve();},sendEmailVerification:function(){var c=curUser();c.emailVerified=true;localStorage.setItem(AUTHK,JSON.stringify(c));var reg=JSON.parse(localStorage.getItem('fake.accts')||'{}');if(reg[c.email])reg[c.email].emailVerified=true;localStorage.setItem('fake.accts',JSON.stringify(reg));return Promise.resolve();}});}
function emitAuth(){var u=mk(curUser());authCbs.forEach(function(f){f(u);});}
var auth={
  get currentUser(){return mk(curUser());},
  onAuthStateChanged:function(cb){authCbs.push(cb);setTimeout(function(){cb(mk(curUser()));},0);},
  createUserWithEmailAndPassword:function(email,pw){var reg=JSON.parse(localStorage.getItem('fake.accts')||'{}');if(reg[email])return Promise.reject({code:'auth/email-already-in-use'});
    var u={uid:'u'+(Object.keys(reg).length+1),email:email,displayName:'',emailVerified:false};reg[email]=Object.assign({pw:pw},u);localStorage.setItem('fake.accts',JSON.stringify(reg));localStorage.setItem(AUTHK,JSON.stringify(u));emitAuth();return Promise.resolve({user:mk(u)});},
  signInWithEmailAndPassword:function(email,pw){var reg=JSON.parse(localStorage.getItem('fake.accts')||'{}');var a=reg[email];if(!a||a.pw!==pw)return Promise.reject({code:'auth/invalid-credential'});
    var u={uid:a.uid,email:a.email,displayName:a.displayName||'',emailVerified:a.emailVerified===true};localStorage.setItem(AUTHK,JSON.stringify(u));emitAuth();return Promise.resolve({user:mk(u)});},
  signOut:function(){localStorage.removeItem(AUTHK);emitAuth();return Promise.resolve();}
};
window.firebase={initializeApp:function(){},auth:Object.assign(function(){return auth;},{GoogleAuthProvider:function(){}}),firestore:function(){return {
  collection:colRef,
  runTransaction:function(work){
    var ops=[],tx={
      get:function(ref){return ref.get();},
      set:function(ref,value,options){ops.push([ref,value,options]);}
    };
    return Promise.resolve(work(tx)).then(function(result){
      var d=load();
      ops.forEach(function(op){d[op[0].path]=(op[2]&&op[2].merge&&d[op[0].path])?Object.assign({},d[op[0].path],op[1]):JSON.parse(JSON.stringify(op[1]));});
      save(d);notify();return result;
    });
  },
  batch:function(){var ops=[];return {set:function(r,v){ops.push([r,v]);},commit:function(){ops.forEach(function(o){o[0].set(o[1]);});return Promise.resolve();}};}
};}};
})();
