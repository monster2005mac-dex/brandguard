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
function splitText(text,maxChars){
  var source=String(text||''),chunks=[],start=0;
  while(start<source.length){
    var end=Math.min(start+maxChars,source.length);
    if(end<source.length){
      var boundary=source.lastIndexOf('\n\n',end);
      if(boundary<start+maxChars*0.96)boundary=source.lastIndexOf('\n',end);
      if(boundary<start+maxChars*0.96)boundary=source.lastIndexOf(' ',end);
      if(boundary>=start+maxChars*0.96)end=boundary+1;
    }
    chunks.push(source.slice(start,end));
    start=end;
  }
  return chunks;
}
function localKey(){try{return localStorage.getItem(KEY_LS)||'';}catch(e){return '';}}
function http(r){
  if(r.status===429)throw {code:'rate_limited'};
  if(r.status===401||r.status===403)throw {code:'not_granted'};
  if(r.status===503)throw {code:'not_configured'};
  if(r.status===413)throw {code:'prompt_too_large'};
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
function callMany(prompts,wantJson){
  if(!Array.isArray(prompts)||!prompts.length||prompts.length>8)return Promise.reject({code:'invalid_request'});
  return Promise.all(prompts.map(function(prompt){return call(prompt,wantJson);}));
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
  verifyCandidates:function(candidates,rules){
    if(!candidates.length)return Promise.resolve([]);
    var groups=[];
    for(var start=0;start<candidates.length;start+=10)groups.push(candidates.slice(start,start+10));
    var prompts=groups.map(function(group){
      return 'You are an independent brand-rule verifier. For each proposed finding, decide whether the cited rule actually prohibits or contradicts the exact quoted draft text. A valid rule ID and real quote are not enough: reject weak, unrelated, or unsupported interpretations. Use only the supplied rule and candidate evidence.\n\nRULES:\n'+
        JSON.stringify(rules)+'\n\nCANDIDATES:\n'+JSON.stringify(group.map(function(c,i){return {index:i,ruleId:c.ruleId,quote:String(c.quote||'').slice(0,2000),issue:String(c.issue||'').slice(0,500),context:String(c.context||'').slice(0,500)};}))+
        '\n\nReturn only a JSON array with one object per candidate: {"index": number, "supported": boolean, "confidence": number from 0 to 1}. Do not omit candidates.';
    });
    return AI.jsonMany(prompts).then(function(responses){
      var results=[];
      responses.forEach(function(rows,groupIndex){
        if(!Array.isArray(rows))throw {code:'invalid_json'};
        var group=groups[groupIndex],byIndex={};
        rows.forEach(function(row){
          if(!row||!Number.isInteger(row.index)||row.index<0||row.index>=group.length||typeof row.supported!=='boolean')return;
          var confidence=Number(row.confidence);
          byIndex[row.index]={supported:row.supported,confidence:isFinite(confidence)?Math.max(0,Math.min(1,confidence)):0};
        });
        group.forEach(function(candidate,index){
          var verdict=byIndex[index]||{supported:false,confidence:0};
          var modelConfidence=Number(candidate.confidence);
          if(!isFinite(modelConfidence))modelConfidence=0.5;
          modelConfidence=Math.max(0,Math.min(1,modelConfidence));
          var agreement=1-Math.abs(modelConfidence-verdict.confidence);
          results.push({supported:verdict.supported,confidence:Math.round(((modelConfidence+verdict.confidence)/2)*agreement*100)/100,
            modelConfidence:modelConfidence,relevanceConfidence:verdict.confidence,agreement:Math.round(agreement*100)/100});
        });
      });
      return results;
    });
  },
  errorCopy:function(e){
    var c=e&&e.code;
    return c==='not_granted'?'Gemini rejected the request. Sign in again, or check the server API key.':
    c==='rate_limited'?'The shared per-user Gemini limit was reached. Wait a minute and try again.':
      c==='invalid_json'?'Gemini replied in an unexpected format. Try again.':
    c==='not_configured'?'Gemini or its shared rate-limit service is not configured. Rule checks still run.':
    c==='prompt_too_large'?'This section is too large for Gemini. Split the input into smaller parts.':
      c==='capability_disabled'?'The deep check is not set up. Rule checks still run.':
      'The deep check could not finish. Rule checks still run.';
  },
  jsonMany:function(prompts){return callMany(prompts,true).then(function(texts){return texts.map(parseLoose);});},

  /* Turn a brand-guidelines document into structured rules. The Admin reviews the result before anything is saved. */
  extractRules:function(docText){
    var source=String(docText||''),maxChars=192000,processed=source.slice(0,maxChars),chunks=splitText(processed,26000);
    var prompts=chunks.map(function(chunk,index){
    return 'You convert this section of a company brand-guidelines document into a machine-checkable rule pack. Use ONLY explicit statements in this section. Never invent facts, numbers or rules. Extract standalone rules; do not assume context from another section. This is section '+(index+1)+' of '+chunks.length+'.\n\n'+
      'DOCUMENT SECTION:\n"""\n'+chunk+'\n"""\n\n'+
      'Reply with ONLY a JSON object with these keys:\n'+
      '{"company": string (the brand name, or ""),\n'+
      ' "guidelines": [{"title": short title, "text": one clear rule sentence}],\n'+
      ' "terms": [{"avoid": a word or phrase the brand does NOT use, "good": the approved replacement}],\n'+
      ' "facts": [{"subject": short name, "value": digits only, "noun": the word that follows the number in copy, "owner": responsible team or role or "Brand team"}],\n'+
      ' "claims": [{"label": claim type, "words": [phrases that make this risky claim]}]}\n'+
      'Keep each list to at most 15 items. Use empty arrays when this section has none.';
    });
    return AI.jsonMany(prompts).then(function(results){
    var result={company:'',guidelines:[],terms:[],facts:[],claims:[],meta:{totalChars:source.length,processedChars:processed.length,chunks:chunks.length,incomplete:processed.length<source.length,omittedItems:0}};
    var seen={guidelines:{},terms:{},facts:{},claims:{}},limits={guidelines:50,terms:50,facts:50,claims:30};
    function arr(value){return Array.isArray(value)?value:[];}
    function str(value){return typeof value==='string'?value.trim():'';}
    function add(type,item,key){
      if(seen[type][key])return;
      seen[type][key]=true;
      if(result[type].length>=limits[type]){result.meta.omittedItems++;return;}
      result[type].push(item);
    }
    results.forEach(function(o){
      if(!o||typeof o!=='object'||Array.isArray(o))throw {code:'invalid_json'};
      if(!result.company)result.company=str(o.company).slice(0,120);
      arr(o.guidelines).forEach(function(g){
        var item={title:str(g&&g.title).slice(0,120),text:str(g&&g.text).slice(0,1000)};
        if(item.title&&item.text)add('guidelines',item,(item.title+'|'+item.text).toLowerCase());
      });
      arr(o.terms).forEach(function(t){
        var item={avoid:str(t&&t.avoid).slice(0,120),good:str(t&&t.good).slice(0,120)};
        if(item.avoid&&item.good&&item.avoid.toLowerCase()!==item.good.toLowerCase())add('terms',item,item.avoid.toLowerCase());
      });
      arr(o.facts).forEach(function(f){
        var value=str(f&&f.value),item={subject:str(f&&f.subject).slice(0,120),value:value,noun:str(f&&f.noun).slice(0,80),owner:str(f&&f.owner).slice(0,120)||'Brand team'};
        if(item.subject&&/^\d+(?:\.\d+)?$/.test(value)&&item.noun)add('facts',item,item.subject.toLowerCase());
      });
      arr(o.claims).forEach(function(c){
        var words=arr(c&&c.words).map(function(w){return str(w).slice(0,120);}).filter(Boolean).slice(0,10);
        var item={label:str(c&&c.label).slice(0,120),words:words};
        if(item.label&&words.length)add('claims',item,item.label.toLowerCase());
      });
    });
    result.meta.incomplete=result.meta.incomplete||result.meta.omittedItems>0;
    return result;
    });
  }
};
AI.chunkText=function(text,maxChars){return splitText(text,maxChars);};
})();
