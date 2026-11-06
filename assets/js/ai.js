/* Optional Gemini deep-check layer managed from the Admin Brand Rules page. */
(function(){
'use strict';
var BG=window.BG=window.BG||{};
var cfg=window.BG_CONFIG||{};
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
function keys(){
  var rules=(BG.store&&BG.store.rules)||{};
  return (rules.gemini&&rules.gemini.keys)||[];
}
function activeKey(){
  var gemini=(BG.store.rules&&BG.store.rules.gemini)||{},active=gemini.active;
  var found=keys().find(function(k){return k.id===active&&k.key;});
  return found||(keys()[0]&&keys()[0].key?keys()[0]:null);
}
function viaGemini(prompt){
  var entry=activeKey();
  if(cfg.aiEndpoint){
    return (BG.store.idToken?BG.store.idToken():Promise.resolve('')).then(function(token){
      return fetch(cfg.aiEndpoint,{
        method:'POST',
        headers:Object.assign({'Content-Type':'application/json'},token?{Authorization:'Bearer '+token}:{}),
        body:JSON.stringify({prompt:prompt})
      });
    }).then(function(r){
      if(r.status===429)throw {code:'rate_limited'};
      if(r.status===401||r.status===403)throw {code:'not_granted'};
      if(!r.ok)throw {code:'upstream_error'};
      return r.json();
    }).then(function(j){
      if(!j.text)throw {code:'invalid_json'};
      return j.text;
    }).catch(function(error){
      if(entry&&entry.key)return callBrowserKey(entry,prompt);
      throw error;
    });
  }
  if(!entry||!entry.key)return Promise.reject({code:'capability_disabled'});
  return callBrowserKey(entry,prompt);
}
function callBrowserKey(entry,prompt){
  return fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+encodeURIComponent(entry.key),{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.1,maxOutputTokens:3000}})
  }).then(function(r){
    if(r.status===429)throw {code:'rate_limited'};
    if(r.status===401||r.status===403)throw {code:'not_granted'};
    if(!r.ok)throw {code:'upstream_error'};
    return r.json();
  }).then(function(j){
    var text=((j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts)||[]).map(function(p){return p.text||'';}).join('\n');
    if(!text)throw {code:'invalid_json'};
    return text;
  });
}
var AI=BG.ai={
  available:false,
  refresh:function(){probed=null;return AI.init();},
  init:function(){
    if(probed)return probed;
    probed=(async function(){
      AI.available=!!cfg.aiEndpoint||!!activeKey();
      return AI.available;
    })();
    return probed;
  },
  text:function(prompt){
    return viaGemini(prompt);
  },
  json:function(prompt){
    return AI.text(prompt).then(parseLoose);
  },
  errorCopy:function(e){
    var c=e&&e.code;
    return c==='not_granted'?'Gemini rejected the configured API key. Rule checks still run.':
      c==='rate_limited'?'Gemini is busy or a usage limit was reached. Try another key later.':
      c==='invalid_json'?'Gemini replied in an unexpected format. Try again.':
      'The deep check could not finish. Rule checks still run.';
  }
};
})();
