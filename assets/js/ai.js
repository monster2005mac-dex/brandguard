/* Gemini layer.
   Live mode: the browser calls /api/gemini (Vercel function). The Gemini key stays on the server.
   Fallback: a personal Gemini key pasted by one person, kept only in THIS browser (localStorage). It is never
   written to Firestore and never shared with other users. */
(function(){
'use strict';
var BG=window.BG=window.BG||{};
var cfg=window.BG_CONFIG||{};
var KEY_LS='bg.geminiKey';
var probed=null;

function parseLoose(text){
  var t=String(text||'').trim();
  try{return JSON.parse(t);}catch(e){}
  var f=t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if(f){try{return JSON.parse(f[1]);}catch(e){}}
  var a=t.search(/[\[{]/),b=Math.max(t.lastIndexOf(']'),t.lastIndexOf('}'));
  if(a>=0&&b>a){try{return JSON.parse(t.slice(a,b+1));}catch(e){}}
  throw {code:'invalid_json',message:'Reply was not JSON'};
}
function localKey(){try{return localStorage.getItem(KEY_LS)||'';}catch(e){return '';}}
function http(r){
  if(r.status===429)throw {code:'rate_limited'};
  if(r.status===401||r.status===403)throw {code:'not_granted'};
  if(r.status===503)throw {code:'not_configured'};
  if(!r.ok)throw {code:'upstream_error'};
  return r.json();
}
function viaServer(prompt,wantJson){
  var token=BG.store&&BG.store.idToken?BG.store.idToken():Promise.resolve('');
  return token.then(function(t){
    return fetch(cfg.aiEndpoint,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},t?{Authorization:'Bearer '+t}:{}),body:JSON.stringify({prompt:prompt,json:!!wantJson})});
  }).then(http).then(function(j){if(!j.text)throw {code:'invalid_json'};return j.text;});
}
function viaBrowserKey(prompt,wantJson){
  var gc={temperature:0.1,maxOutputTokens:8192,thinkingConfig:{thinkingBudget:0}};
  if(wantJson)gc.responseMimeType='application/json';
  return fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':localKey()},
    body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:gc})
  }).then(http).then(function(j){
    var text=((j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts)||[]).map(function(p){return p.text||'';}).join('\n');
    if(!text)throw {code:'invalid_json'};
    return text;
  });
}
function call(prompt,wantJson){
  var live=BG.store&&BG.store.mode==='firebase'&&cfg.aiEndpoint&&AI.server;
  if(live)return viaServer(prompt,wantJson).catch(function(e){
    if(localKey()&&(e.code==='not_configured'||e.code==='upstream_error'))return viaBrowserKey(prompt,wantJson);
    throw e;
  });
  if(localKey())return viaBrowserKey(prompt,wantJson);
  return Promise.reject({code:'capability_disabled'});
}

var AI=BG.ai={
  available:false,server:false,
  hasLocalKey:function(){return !!localKey();},
  setLocalKey:function(k){try{if(k)localStorage.setItem(KEY_LS,k.trim());else localStorage.removeItem(KEY_LS);}catch(e){}return AI.refresh();},
  refresh:function(){probed=null;return AI.init();},
  init:function(){
    if(probed)return probed;
    probed=(async function(){
      AI.server=false;
      var live=BG.store&&BG.store.mode==='firebase'&&cfg.aiEndpoint;
      if(live){
        try{
          var r=await fetch(cfg.aiEndpoint,{method:'GET'});
          if(r.ok){var j=await r.json();AI.server=!!j.configured;}
        }catch(e){}
      }
      AI.available=AI.server||!!localKey();
      return AI.available;
    })();
    return probed;
  },
  text:function(prompt){return call(prompt,false);},
  json:function(prompt){return call(prompt,true).then(parseLoose);},
  errorCopy:function(e){
    var c=e&&e.code;
    return c==='not_granted'?'Gemini rejected the request. Sign in again, or check the server API key.':
      c==='rate_limited'?'Gemini is busy or the per-minute limit was reached. Wait a moment and try again.':
      c==='invalid_json'?'Gemini replied in an unexpected format. Try again.':
      c==='not_configured'?'The server has no GEMINI_API_KEY yet. Rule checks still run.':
      c==='capability_disabled'?'The deep check is not set up. Rule checks still run.':
      'The deep check could not finish. Rule checks still run.';
  },

  /* Turn a brand-guidelines document into structured rules. The Admin reviews the result before anything is saved. */
  extractRules:function(docText){
    var prompt='You convert a company brand-guidelines document into a machine-checkable rule pack. Use ONLY what the document says. Never invent facts, numbers or rules.\n\n'+
      'DOCUMENT:\n"""\n'+String(docText).slice(0,24000)+'\n"""\n\n'+
      'Reply with ONLY a JSON object with these keys:\n'+
      '{"company": string (the brand name, or ""),\n'+
      ' "guidelines": [{"title": short title, "text": one clear rule sentence}],  // tone, style, claims policy, accessibility, formatting rules\n'+
      ' "terms": [{"avoid": a word or phrase the brand does NOT use, "good": the approved replacement}],\n'+
      ' "facts": [{"subject": e.g. "Customer count", "value": digits only e.g. "48000", "noun": the word that follows the number in copy e.g. "customers", "owner": team or role responsible or "Brand team"}],  // only numeric facts explicitly stated\n'+
      ' "claims": [{"label": e.g. "Award claim", "words": [phrases that make this risky claim]}]  // claims needing evidence or legal sign-off\n}\n'+
      'Keep each list to at most 15 items. Use empty arrays when the document has none.';
    return AI.json(prompt).then(function(o){
      if(!o||typeof o!=='object'||Array.isArray(o))throw {code:'invalid_json'};
      function arr(x){return Array.isArray(x)?x:[];}
      function str(x){return typeof x==='string'?x.trim():'';}
      return {
        company:str(o.company),
        guidelines:arr(o.guidelines).map(function(g){return {title:str(g&&g.title),text:str(g&&g.text)};}).filter(function(g){return g.title&&g.text;}).slice(0,15),
        terms:arr(o.terms).map(function(t){return {avoid:str(t&&t.avoid),good:str(t&&t.good)};}).filter(function(t){return t.avoid&&t.good&&t.avoid.toLowerCase()!==t.good.toLowerCase();}).slice(0,15),
        facts:arr(o.facts).map(function(f){return {subject:str(f&&f.subject),value:String(f&&f.value!=null?f.value:'').replace(/[^\d.]/g,''),noun:str(f&&f.noun),owner:str(f&&f.owner)||'Brand team'};}).filter(function(f){return f.subject&&f.value&&f.noun;}).slice(0,15),
        claims:arr(o.claims).map(function(c){return {label:str(c&&c.label),words:arr(c&&c.words).map(str).filter(Boolean).slice(0,10)};}).filter(function(c){return c.label&&c.words.length;}).slice(0,10)
      };
    });
  }
};
})();
