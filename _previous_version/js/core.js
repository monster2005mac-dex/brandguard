/* BrandGuard core: state, brand pack, rule engine, workflow helpers, AI layer and the shared app shell.
   Every app page loads this file, then its own page script. State lives in localStorage so pages share it. */
(function(){
'use strict';

/* ---------- helpers ---------- */
var LS_KEY='brandguard.site.v1';
var NOW=new Date();
var TODAY=NOW.toISOString().slice(0,10);
function isoPlus(days){return new Date(NOW.getTime()+days*864e5).toISOString().slice(0,10);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function escRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function cap(orig,repl,text,idx){
  var start=idx===0||/(^|[.!?\n])\s*$/.test(text.slice(0,idx));
  return start&&/^[a-z]/.test(repl)?repl[0].toUpperCase()+repl.slice(1):repl;
}
function fmt(iso){try{return new Date(iso).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});}catch(e){return iso;}}
function plural(n,w){return n+' '+w+(n===1?'':'s');}
function $(id){return document.getElementById(id);}

var ICONS={
  pen:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  flow:'<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5v7M8.5 6H12a3 3 0 0 1 3 3v.5M8.5 18H12a3 3 0 0 0 3-3v-.5"/>',
  book:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  home:'<path d="M3 11 12 3l9 8v10H3Z"/><path d="M9 21v-6h6v6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
};
function icon(n){return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">'+(ICONS[n]||'')+'</svg>';}

var mem=null;
function loadState(){
  try{var raw=localStorage.getItem(LS_KEY);if(raw)return JSON.parse(raw);}catch(e){}
  return mem?JSON.parse(mem):null;
}
function saveState(){
  var s=JSON.stringify(S);mem=s;
  try{localStorage.setItem(LS_KEY,s);}catch(e){}
}

/* ---------- seed data: a fictional brand pack ---------- */
var SAMPLE_DRAFT=
"We are India's #1 learning platform and we guarantee 100% results! Over 52,000 learners already study with us, and students love our chatbot. Pick from 150 courses at a super cheap price of just ₹299 a month. Gonna be the best decision you make this year!!!\n\n"+
"Click here: https://northwind.example/join\n\n"+
"<img src=\"team-photo.jpg\">";

function seedRules(){
  return {
    company:'Northwind Learn (fictional demo brand)',
    guidelines:[
      {id:'G-01',title:'Warm, professional tone',text:'Write in a warm, professional voice. No slang or intensifiers like "super". At most one exclamation mark per post.',check:'tone',category:'Tone'},
      {id:'G-02',title:'No guaranteed outcomes',text:'Never promise guaranteed, risk-free or 100% outcomes.',check:'absolutes',category:'Claims'},
      {id:'G-03',title:'Plain sentences',text:'Keep sentences under 25 words so they are easy to read.',check:'readability',category:'Readability'},
      {id:'G-04',title:'Accessible media and links',text:'Every image needs alt text. Link text must say where the link goes, never "click here".',check:'a11y',category:'Accessibility'}
    ],
    terms:[
      {id:'T-01',avoid:'student(s)',pattern:'student(s?)',good:'learner$1',text:'Say "learner", not "student".'},
      {id:'T-02',avoid:'cheap',pattern:'cheap',good:'affordable',text:'Say "affordable", not "cheap".'},
      {id:'T-03',avoid:'chatbot',pattern:'chatbot',good:'AI Coach',text:'Our tutoring assistant is called "AI Coach", not "chatbot".'}
    ],
    facts:[
      {id:'F-01',subject:'Learner count',value:'48,000',display:'48,000 learners',pattern:'(\\d[\\d,]*)\\+?\\s+learners',owner:'Growth team',expires:'2027-03-31'},
      {id:'F-02',subject:'Monthly price',value:'499',display:'₹499 per month',pattern:'₹\\s?(\\d[\\d,]*)',owner:'Finance',expires:'2026-09-30'},
      {id:'F-03',subject:'Course count',value:'120',display:'120 courses',pattern:'(\\d[\\d,]*)\\+?\\s+courses',owner:'Content team',expires:isoPlus(20)}
    ],
    claims:[
      {id:'C-01',label:'Market ranking',pattern:"(?:india['’]s\\s+)?(?:#\\s?1|no\\.\\s?1|number\\s+one)|best\\s+in\\s+india|market\\s+leader",evidence:'',fix:'a trusted',text:'Ranking claims need third-party evidence on file and a reviewer sign-off.'},
      {id:'C-02',label:'Proven results',pattern:'clinically\\s+proven|scientifically\\s+proven|proven\\s+to',evidence:'',fix:'designed around learning research to',text:'"Proven" claims need a cited study on file.'}
    ]
  };
}
function seedEvents(){
  var d=function(n){return new Date(NOW.getTime()-n*864e5).toISOString();};
  var e=[];
  function add(rule,cat,outcome,n,reason){e.push({ruleId:rule,category:cat,outcome:outcome,at:d(n),reason:reason||'',sample:true});}
  add('G-01','Tone','disputed',9,'Slang is part of our festive campaign voice.');
  add('G-01','Tone','disputed',7,'"Super" is how our learners talk. Unclear if it is banned.');
  add('G-01','Tone','disputed',5,'Is a single exclamation mark in a headline allowed?');
  add('G-01','Tone','accepted',4);
  add('G-03','Readability','disputed',8,'Legal disclaimer sentences are long by design.');
  add('G-03','Readability','disputed',6,'Course titles count as one long sentence.');
  add('G-03','Readability','accepted',3);
  add('G-02','Claims','accepted',10);add('G-02','Claims','accepted',8);add('G-02','Claims','accepted',2);add('G-02','Claims','disputed',1,'Refund policy wording says "guaranteed refund".');
  add('T-01','Terminology','accepted',10);add('T-01','Terminology','accepted',9);add('T-01','Terminology','accepted',6);add('T-01','Terminology','accepted',2);
  add('C-01','Claims','accepted',7);add('C-01','Claims','accepted',3);add('C-01','Claims','accepted',1);
  add('F-02','Facts','accepted',5);add('F-02','Facts','accepted',2);
  add('G-04','Accessibility','accepted',6);add('G-04','Accessibility','accepted',4);
  return e;
}
function seedDocs(){
  var t=function(n){return new Date(NOW.getTime()-n*36e5).toISOString();};
  return [
    {id:'d-s1',sample:true,title:'Festive offer email',type:'Email',status:'In review',
     versions:[{n:1,text:'Join Northwind Learn this festive season. Our AI Coach and 120 courses help every learner build a skill at an affordable ₹499 per month. No-brainer! Start today.',at:t(20),by:'Creator',summary:{high:0,disputed:1,resolved:3,openList:[],disputedList:[{ruleId:'G-01',quote:'No-brainer',reason:'Festive campaign voice.'}]}}],
     comments:[{by:'Creator',text:'Disputed the slang flag. This is the campaign tagline.',at:t(19)}],
     audit:[{at:t(21),who:'Creator',what:'Saved version 1'},{at:t(20),who:'Creator',what:'Submitted version 1 for approval'}]},
    {id:'d-s2',sample:true,title:'Launch announcement post',type:'LinkedIn post',status:'Approved',
     versions:[{n:1,text:'Northwind Learn now offers 120 courses with an AI Coach for every learner.',at:t(70),by:'Creator',summary:{high:0,disputed:0,resolved:2,openList:[],disputedList:[]}}],
     comments:[{by:'Reviewer',text:'Facts match F-03. Approved.',at:t(48)}],
     audit:[{at:t(72),who:'Creator',what:'Saved version 1'},{at:t(70),who:'Creator',what:'Submitted version 1 for approval'},{at:t(48),who:'Reviewer',what:'Approved version 1'}]}
  ];
}
function freshSession(){return {docId:null,title:'Northwind Learn launch post',type:'LinkedIn post',text:SAMPLE_DRAFT,ai:[],disputed:{},resolved:[],aiMeta:null};}
function seed(){return {v:1,role:'Creator',rules:seedRules(),docs:seedDocs(),events:seedEvents(),session:freshSession()};}

var S=loadState();
if(!S||S.v!==1)S=seed();
var U={openCard:null,aiBusy:false,aiMsg:'',aiAvail:null,toast:'',selDoc:null,gap:{},gapBusy:null,timer:null};

/* ---------- rule helpers ---------- */
function allRules(){
  var R=S.rules,out=[];
  R.guidelines.forEach(function(g){out.push({id:g.id,kind:'guideline',category:g.category||'Tone',text:g.text});});
  R.terms.forEach(function(t){out.push({id:t.id,kind:'terminology',category:'Terminology',text:t.text});});
  R.facts.forEach(function(f){out.push({id:f.id,kind:'approved fact',category:'Facts',text:f.subject+' is '+f.display+' (owner: '+f.owner+', valid to '+f.expires+')'});});
  R.claims.forEach(function(c){out.push({id:c.id,kind:'claims register',category:'Claims',text:c.text});});
  return out;
}
function ruleById(id){return allRules().find(function(r){return r.id===id;});}
function factStatus(f){return f.expires<TODAY?'expired':(f.expires<=isoPlus(30)?'soon':'current');}
function nextId(prefix,arr){
  var max=0;arr.forEach(function(x){var n=parseInt(x.id.split('-')[1],10);if(n>max)max=n;});
  return prefix+'-'+String(max+1).padStart(2,'0');
}

/* ---------- rule engine (deterministic) ---------- */
function runRules(text,R){
  var out=[];
  function add(f){f.source='rule';if(f.confidence==null)f.confidence=0.95;out.push(f);}
  function iter(re,fn){re.lastIndex=0;var m;while((m=re.exec(text))!==null){if(m[0]===''){re.lastIndex++;continue;}fn(m);}}
  function span(m){return {start:m.index,end:m.index+m[0].length,quote:m[0]};}

  R.guidelines.forEach(function(g){
    if(g.check==='tone'){
      var slang={gonna:'it is going to',wanna:'want to',"super":'very','no-brainer':'easy choice',insane:'remarkable','awesome sauce':'excellent'};
      iter(new RegExp('\\b('+Object.keys(slang).map(escRe).join('|')+')\\b','gi'),function(m){
        var s=span(m);s.ruleId=g.id;s.category='Tone';s.severity='low';
        s.why='"'+m[0]+'" is slang or an intensifier. The tone rule asks for a warm, professional voice.';
        s.suggestion=cap(m[0],slang[m[0].toLowerCase()],text,m.index);add(s);
      });
      var run=0;
      iter(/!+/g,function(m){
        run++;
        if(run>1||m[0].length>1){
          var s=span(m);s.ruleId=g.id;s.category='Tone';s.severity='low';
          s.why=m[0].length>1?'Repeated exclamation marks.':'This is the second exclamation mark in the post. The rule allows one.';
          s.suggestion='.';add(s);
        }
      });
    }
    if(g.check==='absolutes'){
      iter(/\bguarantee[ds]?\s+(?:100\s?%\s+)?/gi,function(m){
        var s=span(m);s.ruleId=g.id;s.category='Claims';s.severity='high';
        s.why='Promising a guaranteed outcome is not allowed. Outcomes depend on the learner.';
        s.suggestion='aim for ';add(s);
      });
      iter(/\b100\s?%\s+(?=[A-Za-z])/gi,function(m){
        var s=span(m);s.ruleId=g.id;s.category='Claims';s.severity='high';
        s.why='"100%" promises a complete outcome. Remove the absolute or cite approved evidence.';
        s.suggestion='';add(s);
      });
      iter(/\brisk[- ]free\b/gi,function(m){
        var s=span(m);s.ruleId=g.id;s.category='Claims';s.severity='high';
        s.why='"Risk-free" is an absolute promise.';s.suggestion='easy to try';add(s);
      });
    }
    if(g.check==='a11y'){
      iter(/<img\b(?![^>]*\balt\s*=)[^>]*>/gi,function(m){
        var s=span(m);s.ruleId=g.id;s.category='Accessibility';s.severity='medium';
        s.why='This image has no alt text, so screen-reader users get nothing.';
        s.suggestion=m[0].replace(/<img\b/i,'<img alt="DESCRIBE THE IMAGE"');s.needsInput=true;add(s);
      });
      iter(/!\[\s*\]\([^)]*\)/g,function(m){
        var s=span(m);s.ruleId=g.id;s.category='Accessibility';s.severity='medium';
        s.why='This image has empty alt text.';
        s.suggestion=m[0].replace(/!\[\s*\]/,'![DESCRIBE THE IMAGE]');s.needsInput=true;add(s);
      });
      iter(/\b(click here|read more)\b/gi,function(m){
        var s=span(m);s.ruleId=g.id;s.category='Accessibility';s.severity='low';
        s.why='Link text should say where the link goes. "'+m[0]+'" means nothing out of context.';
        s.suggestion='Join Northwind Learn';s.needsInput=true;add(s);
      });
    }
    if(g.check==='readability'){
      iter(/[^.!?\n]+[.!?]*/g,function(m){
        var words=m[0].trim().split(/\s+/).filter(Boolean).length;
        if(words>25){
          var lead=m[0].length-m[0].trimStart().length;
          var q=m[0].trim();
          add({ruleId:g.id,category:'Readability',severity:'low',start:m.index+lead,end:m.index+lead+q.length,quote:q,
            why:'This sentence has '+words+' words. The rule asks for under 25.',suggestion:'',adviceOnly:true,confidence:0.9});
        }
      });
    }
  });

  R.terms.forEach(function(t){
    iter(new RegExp('\\b'+t.pattern+'\\b','gi'),function(m){
      var s=span(m);s.ruleId=t.id;s.category='Terminology';s.severity='medium';
      var rep=m[0].replace(new RegExp(t.pattern,'i'),t.good);
      s.suggestion=cap(m[0],rep,text,m.index);
      s.why='"'+m[0]+'" is not the approved term. '+t.text;add(s);
    });
  });

  R.facts.forEach(function(f){
    var norm=function(x){return String(x).replace(/[^\d.]/g,'');};
    var st=factStatus(f);
    iter(new RegExp(f.pattern,'gi'),function(m){
      var s=span(m);s.ruleId=f.id;s.category='Facts';
      var found=m[1]||'';
      if(norm(found)!==norm(f.value)){
        s.severity='high';
        s.why='Approved '+f.subject.toLowerCase()+' is '+f.display+'. The draft says '+found+'.'+(st==='expired'?' This fact expired on '+f.expires+', so the owner ('+f.owner+') must confirm the current value.':'');
        s.suggestion=m[0].replace(found,f.value);
        s.reviewerOnly=st==='expired';
        add(s);
      }else if(st==='expired'){
        s.severity='medium';
        s.why='The figure matches '+f.id+', but that fact expired on '+f.expires+'. Ask '+f.owner+' to reconfirm it before publishing.';
        s.suggestion='';s.adviceOnly=true;s.reviewerOnly=true;s.confidence=0.8;add(s);
      }
    });
  });

  R.claims.forEach(function(c){
    if(c.evidence&&c.evidence.trim())return;
    iter(new RegExp(c.pattern,'gi'),function(m){
      var s=span(m);s.ruleId=c.id;s.category='Claims';s.severity='high';s.reviewerOnly=true;
      s.why=c.label+' claim with no evidence on file. '+c.text;
      s.suggestion=cap(m[0],c.fix,text,m.index);add(s);
    });
  });

  out.sort(function(a,b){return a.start-b.start||(b.end-b.start)-(a.end-a.start);});
  var kept=[],last=-1;
  out.forEach(function(f){if(f.start>=last){kept.push(f);last=f.end;}});
  return kept;
}
function confLabel(f){return f.confidence>=0.8?'High':f.confidence>=0.5?'Medium':'Needs human judgement';}

function recompute(){
  var ss=S.session,rf=runRules(ss.text,S.rules),af=[];
  ss.ai.forEach(function(a){
    var i=ss.text.indexOf(a.quote);if(i<0)return;
    var f=Object.assign({},a,{start:i,end:i+a.quote.length,source:'ai'});
    var clash=rf.concat(af).some(function(r){return r.start<f.end&&f.start<r.end;});
    if(!clash)af.push(f);
  });
  var all=rf.concat(af).sort(function(a,b){return a.start-b.start;});
  var seen={};
  all.forEach(function(f){
    var k=f.ruleId+'|'+f.quote.toLowerCase();seen[k]=(seen[k]||0)+1;
    f.key=k+'|'+seen[k];
    f.status=ss.disputed[f.key]?'disputed':'open';
    f.reason=ss.disputed[f.key]||'';
  });
  ss.findings=all;
}
function summaryOf(){
  var f=S.session.findings||[];
  var open=f.filter(function(x){return x.status==='open';});
  return {open:open,high:open.filter(function(x){return x.severity==='high';}),disputed:f.filter(function(x){return x.status==='disputed';}),resolved:S.session.resolved.length};
}

/* ---------- diff ---------- */
function diffHtml(a,b){
  if(b==='')return '<del>'+esc(a)+'</del>';
  var ta=a.split(/(\s+)/).filter(Boolean),tb=b.split(/(\s+)/).filter(Boolean);
  var n=ta.length,m=tb.length;
  if(n*m>40000)return '<del>'+esc(a)+'</del> <ins>'+esc(b)+'</ins>';
  var dp=[],i,j;
  for(i=0;i<=n;i++){dp.push(new Array(m+1).fill(0));}
  for(i=n-1;i>=0;i--)for(j=m-1;j>=0;j--)dp[i][j]=ta[i]===tb[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  var out=[];i=0;j=0;
  while(i<n&&j<m){
    if(ta[i]===tb[j]){out.push({t:'s',v:ta[i]});i++;j++;}
    else if(dp[i+1][j]>=dp[i][j+1]){out.push({t:'d',v:ta[i]});i++;}
    else{out.push({t:'i',v:tb[j]});j++;}
  }
  while(i<n){out.push({t:'d',v:ta[i++]});}
  while(j<m){out.push({t:'i',v:tb[j++]});}
  for(var k=1;k<out.length-1;k++){
    if(out[k].t==='s'&&/^\s+$/.test(out[k].v)&&out[k-1].t!=='s'&&out[k+1].t!=='s')out[k].t='c';
  }
  var html='',idx=0;
  while(idx<out.length){
    if(out[idx].t==='s'){html+=esc(out[idx].v);idx++;continue;}
    var dels='',ins='';
    while(idx<out.length&&out[idx].t!=='s'){
      if(out[idx].t!=='i')dels+=out[idx].v;
      if(out[idx].t!=='d')ins+=out[idx].v;
      idx++;
    }
    if(dels.trim())html+='<del>'+esc(dels.trim())+'</del>';
    if(dels.trim()&&ins.trim())html+=' ';
    if(ins.trim())html+='<ins>'+esc(ins.trim())+'</ins>';
  }
  return html;
}

/* ---------- workflow helpers ---------- */
var ROLES=['Creator','Reviewer','Admin'];
function can(){return {edit:S.role!=='Reviewer',approve:S.role!=='Creator',admin:S.role==='Admin'};}
function currentDoc(){return S.session.docId?S.docs.find(function(d){return d.id===S.session.docId;}):null;}
function addAudit(d,who,what){d.audit.push({at:new Date().toISOString(),who:who,what:what});}
function logEvent(f,outcome,reason){S.events.push({ruleId:f.ruleId,category:f.category,outcome:outcome,at:new Date().toISOString(),reason:reason||''});}
function statusPill(s){
  var k=s==='Approved'?'ok':s==='In review'?'accent':s==='Changes requested'?'medium':'neutral';
  return '<span class="pill '+k+'">'+esc(s)+'</span>';
}
function saveVersion(){
  var ss=S.session;
  if(!ss.title.trim()){toast('Add a title first.');return null;}
  if(!ss.text.trim()){toast('The draft is empty.');return null;}
  recompute();
  var sm=summaryOf();
  var summary={high:sm.high.length,disputed:sm.disputed.length,resolved:ss.resolved.length,
    openList:sm.open.slice(0,8).map(function(x){return {ruleId:x.ruleId,severity:x.severity,quote:x.quote};}),
    disputedList:sm.disputed.map(function(x){return {ruleId:x.ruleId,quote:x.quote,reason:x.reason};})};
  var d=currentDoc();
  if(!d){
    d={id:'d-'+Date.now(),title:ss.title.trim(),type:ss.type,status:'Draft',versions:[],comments:[],audit:[]};
    S.docs.push(d);ss.docId=d.id;
  }
  d.title=ss.title.trim();d.type=ss.type;
  var n=d.versions.length+1;
  d.versions.push({n:n,text:ss.text,at:new Date().toISOString(),by:S.role,summary:summary});
  addAudit(d,S.role,'Saved version '+n);
  if(d.status==='Approved'||d.status==='Changes requested'){addAudit(d,'System','Status reset to Draft because the content changed. It needs review again.');d.status='Draft';}
  saveState();
  return d;
}
function loadSample(){
  var ss=S.session;
  ss.text=SAMPLE_DRAFT;ss.title='Northwind Learn launch post';ss.type='LinkedIn post';ss.ai=[];ss.disputed={};ss.resolved=[];ss.aiMeta=null;ss.docId=null;
  U.openCard=null;recompute();saveState();
}
function insightRows(){
  var map={};
  S.events.forEach(function(e){
    var r=map[e.ruleId]||(map[e.ruleId]={ruleId:e.ruleId,category:e.category,total:0,fixed:0,disputed:0,reasons:[]});
    r.total++;
    if(e.outcome==='disputed'){r.disputed++;if(e.reason)r.reasons.push(e.reason);}else r.fixed++;
  });
  return Object.keys(map).map(function(k){var r=map[k];r.rate=r.total?r.disputed/r.total:0;r.gap=r.disputed>=2&&r.rate>=0.5;return r;})
    .sort(function(a,b){return b.disputed-a.disputed||b.total-a.total;});
}

/* ---------- AI layer: claude.ai "sample" capability, or an optional endpoint ---------- */
var samplePromise=null,sampleFn=null;
function getSample(){
  if(!samplePromise)samplePromise=(async function(){try{return (window.claude&&window.claude.use)?await window.claude.use('sample'):null;}catch(e){return null;}})();
  return samplePromise;
}
async function aiAsk(prompt,wantJson){
  if(sampleFn){
    if(wantJson)return await sampleFn.json(prompt,{modelTier:'default'});
    return (await sampleFn(prompt,{modelTier:'default'})).text;
  }
  var cfg=window.BG_CONFIG||{};
  var r=await fetch(cfg.aiEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:prompt})});
  if(!r.ok)throw {code:r.status===429?'rate_limited':'upstream_error'};
  var j=await r.json(),t=j.text||'';
  if(!wantJson)return t;
  var m=t.match(/\[[\s\S]*\]/);
  try{return JSON.parse(m?m[0]:t);}catch(e){throw {code:'invalid_json'};}
}
async function runAI(){
  if(!U.aiAvail){U.aiMsg='Deep check with Claude is not available here. Rule checks still run.';render();return;}
  var ss=S.session;
  if(!ss.text.trim())return;
  U.aiBusy=true;U.aiMsg='Claude is reading the draft against '+allRules().length+' brand rules. This can take up to a minute.';render();
  var rules=allRules().map(function(r){return {id:r.id,type:r.kind,rule:r.text};});
  var already=ss.findings.filter(function(f){return f.source==='rule';}).map(function(f){return {ruleId:f.ruleId,quote:f.quote};});
  var prompt=
   'You are a brand-compliance reviewer. Review the DRAFT only against the BRAND RULES below. Do not invent rules.\n\n'+
   'BRAND RULES (JSON):\n'+JSON.stringify(rules)+'\n\n'+
   'DRAFT:\n"""\n'+ss.text.slice(0,6000)+'\n"""\n\n'+
   'ALREADY FOUND BY EXACT CHECKS (do not repeat): '+JSON.stringify(already)+'\n\n'+
   'Find judgement issues the exact checks miss: tone that is too casual or pushy, claims that imply a guarantee or ranking without using the exact words, meaning that contradicts an approved fact or rule.\n'+
   'Reply with only a JSON array. Each item: {"ruleId": one id from BRAND RULES, "quote": text copied EXACTLY from the DRAFT, "issue": one sentence, "suggestion": replacement for the quote that keeps the writer\'s intent, "severity": "high"|"medium"|"low", "confidence": number from 0 to 1}. If nothing else is wrong reply [].';
  try{
    var data=await aiAsk(prompt,true);
    var list=Array.isArray(data)?data:[];
    var kept=[],dropped=0,dup=0;
    list.forEach(function(it){
      var rule=it&&ruleById(String(it.ruleId));
      var q=it&&typeof it.quote==='string'?it.quote:'';
      var idx=q?ss.text.indexOf(q):-1;
      if(!rule||idx<0||!String(it.issue||'').trim()){dropped++;return;}
      var overlapRule=ss.findings.some(function(f){return f.source==='rule'&&f.start<idx+q.length&&idx<f.end;});
      if(overlapRule){dup++;return;}
      var sev=['high','medium','low'].indexOf(it.severity)>=0?it.severity:'medium';
      var conf=Math.max(0,Math.min(1,Number(it.confidence)));if(isNaN(conf))conf=0.5;
      var sug=typeof it.suggestion==='string'?it.suggestion:'';
      var claimish=rule.category==='Claims'||rule.category==='Facts';
      kept.push({ruleId:rule.id,category:rule.category,severity:sev,quote:q,why:String(it.issue),suggestion:sug,adviceOnly:!sug||sug===q,confidence:conf,reviewerOnly:claimish&&sev==='high'});
    });
    ss.ai=kept;
    ss.aiMeta='Claude suggested '+list.length+' issue'+(list.length===1?'':'s')+'. '+kept.length+' passed source verification and are shown. '+dropped+' were dropped because they cited no real rule or quoted text that is not in the draft'+(dup?', and '+dup+' repeated an exact check':'')+'.';
    U.aiMsg='Deep check finished.';
  }catch(e){
    var code=e&&e.code;
    U.aiMsg=code==='not_granted'?'Claude access was not allowed for this page. Rule checks still run.':
      code==='rate_limited'?'Claude is busy or a usage limit was reached. Try again later.':
      code==='invalid_json'?'Claude replied in an unexpected format. Try again.':'The deep check could not finish. Rule checks still run.';
  }
  U.aiBusy=false;recompute();saveState();render();
}
async function runGap(id){
  if(!U.aiAvail)return;
  var r=insightRows().find(function(x){return x.ruleId===id;});var rule=ruleById(id);
  U.gapBusy=id;render();
  var prompt='A brand guideline is often disputed by content creators because it is unclear.\nRULE ('+id+'): '+rule.text+'\nCREATOR OBJECTIONS: '+JSON.stringify(r.reasons)+'\n\nRewrite the rule in at most 3 sentences so it is unambiguous. Say exactly what is allowed and what is not, with one short example of each. Reply with only the new rule text.';
  try{U.gap[id]=(await aiAsk(prompt,false)).trim();}
  catch(e){toast('Claude could not suggest wording right now.');}
  U.gapBusy=null;render();
}

/* ---------- shell and page plumbing ---------- */
var PAGES=[['review','Review','pen','review.html'],['workflow','Workflow','flow','workflow.html'],['rules','Brand rules','book','rules.html'],['insights','Insights','chart','insights.html']];
var page=null,handlers={};
function toast(msg){
  U.toast=msg;
  var els=document.querySelectorAll('.toast');for(var i=0;i<els.length;i++)els[i].textContent=msg;
  clearTimeout(toast.t);toast.t=setTimeout(function(){U.toast='';var e2=document.querySelectorAll('.toast');for(var k=0;k<e2.length;k++)e2[k].textContent='';},4200);
}
function sideHtml(cur){
  var inReview=S.docs.filter(function(d){return d.status==='In review';}).length;
  return '<a class="logo" href="index.html" aria-label="BrandGuard home">Brand<span>Guard</span></a>'+
    '<nav class="nav" aria-label="App">'+PAGES.map(function(p){
      return '<a href="'+p[3]+'"'+(cur===p[0]?' aria-current="page"':'')+'>'+icon(p[2])+p[1]+(p[0]==='workflow'&&inReview?'<span class="count">'+inReview+'</span>':'')+'</a>';}).join('')+
      '<div class="sep"></div><a href="index.html">'+icon('home')+'Home</a><a href="how-it-works.html">'+icon('info')+'How it works</a></nav>'+
    '<div class="side-foot"><div class="lbl">Acting as</div><div class="seg" role="group" aria-label="Role">'+ROLES.map(function(r){
      return '<button data-action="role" data-role="'+r+'" aria-pressed="'+(S.role===r)+'">'+r+'</button>';}).join('')+'</div>'+
      '<div class="small muted tip">Demo role switch. A production build uses sign-in.</div></div>';
}
function render(){
  var y=window.scrollY;
  var side=$('side');if(side)side.innerHTML=sideHtml(document.body.dataset.page);
  if(page&&page.render){$('main').innerHTML=page.render();}
  window.scrollTo(0,y);
  if(page&&page.after)page.after();
}
function on(map){Object.keys(map).forEach(function(k){handlers[k]=map[k];});}
function setPage(p){page=p;}
function go(url){location.href=url;}

document.addEventListener('click',function(ev){
  var el=ev.target.closest('[data-action]');if(!el)return;
  var a=el.dataset.action;
  if(a==='role'){S.role=el.dataset.role;U.openCard=null;saveState();render();return;}
  if(handlers[a])handlers[a](el,ev);
});

function boot(){
  var cur=document.body.dataset.page;
  document.body.insertAdjacentHTML('afterbegin','<div class="app"><aside class="side" id="side"></aside><div class="content"><div class="content-in"><main id="main"></main>'+
    '<div class="foot"><div><b>AI use disclosure.</b> Rule checks run in your browser and send nothing anywhere. The optional deep check sends the draft and the brand rule list to Claude. Claude never edits or approves anything: a person clicks Accept, Edit or Dispute on every finding.</div>'+
    '<div>Built with AI assistance (Claude) for CodeNexus India 2026, Round 2. The brand pack, facts and sample history are fictional demo data.</div></div></div></div></div>');
  recompute();
  render();
  getSample().then(function(s){
    sampleFn=s;
    var cfg=window.BG_CONFIG||{};
    U.aiAvail=!!s||!!cfg.aiEndpoint;
    var ae=document.activeElement;
    if(!(ae&&(ae.id==='draft'||ae.tagName==='INPUT'||ae.tagName==='TEXTAREA')))render();
  });
}

window.BG={S:S,U:U,esc:esc,escRe:escRe,fmt:fmt,plural:plural,$:$,icon:icon,toast:toast,saveState:saveState,seed:seed,
  recompute:recompute,summaryOf:summaryOf,diffHtml:diffHtml,confLabel:confLabel,ruleById:ruleById,allRules:allRules,factStatus:factStatus,
  nextId:nextId,logEvent:logEvent,addAudit:addAudit,saveVersion:saveVersion,currentDoc:currentDoc,loadSample:loadSample,
  insightRows:insightRows,statusPill:statusPill,can:can,render:render,on:on,page:setPage,go:go,runAI:runAI,runGap:runGap,boot:boot,
  reset:function(){var n=seed();Object.keys(S).forEach(function(k){delete S[k];});Object.assign(S,n);U.openCard=null;U.gap={};recompute();saveState();}};
})();
