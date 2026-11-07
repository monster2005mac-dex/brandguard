/* BrandGuard engine: helpers, brand checks, deterministic rule checks, word diff, readiness score.
   Pure functions, no DOM and no network. Exposed as BG.engine. */
(function(){
'use strict';
var BG=window.BG=window.BG||{};
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
function clone(x){return JSON.parse(JSON.stringify(x));}

/* ---------- empty production defaults ---------- */
var SAMPLE_DRAFT='';

function seedRules(){
  return {
    company:'Your company',
    guidelines:[],
    terms:[],
    facts:[],
    claims:[]
  };
}
/* A real workspace starts from this: the generic exact checks, no invented company facts.
   The Admin adds terms, facts and claims, or imports them from a brand-guidelines document. */
function templateRules(company){
  var r=seedRules();
  r.company=company||'Your company';
  r.terms=[];r.facts=[];
  r.gemini=undefined;delete r.gemini;
  return r;
}
function brandName(R){return String((R&&R.company)||'our brand').replace(/\s*\(.*?\)\s*/g,' ').trim()||'our brand';}
function seedEvents(){
  return [];
}
function seedDocs(){
  return [];
}
function seedAll(){return {rules:seedRules(),docs:seedDocs(),events:seedEvents()};}
function freshSession(){return {docId:null,title:'Untitled draft',type:'LinkedIn post',intent:'',text:SAMPLE_DRAFT,ai:[],disputed:{},resolved:[],aiMeta:null};}

/* ---------- rule catalogue (what a finding can cite) ---------- */
function factStatus(f){return f.expires<TODAY?'expired':(f.expires<=isoPlus(30)?'soon':'current');}
function allRules(R){
  var out=[];
  R.guidelines.forEach(function(g){out.push({id:g.id,kind:'guideline',category:g.category||'Tone',text:g.text});});
  R.terms.forEach(function(t){out.push({id:t.id,kind:'terminology',category:'Terminology',text:t.text});});
  R.facts.forEach(function(f){out.push({id:f.id,kind:'approved fact',category:'Facts',text:f.subject+' is '+f.display+' (owner: '+f.owner+', valid to '+f.expires+')'});});
  R.claims.forEach(function(c){out.push({id:c.id,kind:'claims register',category:'Claims',text:c.text});});
  return out;
}
function nextId(prefix,arr){
  var max=0;arr.forEach(function(x){var n=parseInt(x.id.split('-')[1],10);if(n>max)max=n;});
  return prefix+'-'+String(max+1).padStart(2,'0');
}

/* ---------- deterministic rule checks ---------- */
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
        s.suggestion='Visit '+brandName(R);s.needsInput=true;add(s);
      });
      iter(/https?:\/\/\S+/gi,function(m){
        var s=span(m);s.ruleId=g.id;s.category='Accessibility';s.severity='low';
        s.why='A bare URL is difficult to understand in screen readers and assistive previews. Use meaningful destination text.';
        s.suggestion='Visit '+brandName(R);s.needsInput=true;add(s);
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

/* readiness score: 100 minus weighted open findings */
function score(findings){
  var pen=0;
  findings.forEach(function(f){if(f.status!=='open')return;pen+=f.severity==='high'?10:f.severity==='medium'?4:2;});
  return Math.max(0,100-pen);
}

/* ---------- word diff, grouped into one deletion and one insertion per change ---------- */
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

/* ---------- insights from the event log ---------- */
function insightRows(events){
  var map={};
  events.forEach(function(e){
    var r=map[e.ruleId]||(map[e.ruleId]={ruleId:e.ruleId,category:e.category,total:0,fixed:0,disputed:0,reasons:[]});
    r.total++;
    if(e.outcome==='disputed'){r.disputed++;if(e.reason)r.reasons.push(e.reason);}else r.fixed++;
  });
  return Object.keys(map).map(function(k){var r=map[k];r.rate=r.total?r.disputed/r.total:0;r.gap=r.disputed>=2&&r.rate>=0.5;return r;})
    .sort(function(a,b){return b.disputed-a.disputed||b.total-a.total;});
}

function reliability(){
 var tests=[
   {text:'We guarantee 100% results.',ruleId:'G-02',expected:true},
   {text:'Students can learn at their own pace.',ruleId:'T-01',expected:true},
   {text:'We offer 120 courses for every learner.',ruleId:'F-03',expected:false},
   {text:'India’s #1 learning platform.',ruleId:'C-01',expected:true},
   {text:'Our learners use an affordable monthly plan.',ruleId:null,expected:false}
 ];
 var matched=0,tp=0,fp=0,fn=0;
 tests.forEach(function(t){
   var found=runRules(t.text,seedRules());
   var hit=!!(t.ruleId&&found.some(function(f){return f.ruleId===t.ruleId;}));
   if(hit===t.expected)matched++;
   if(hit&&t.expected)tp++;
   if(hit&&!t.expected)fp++;
   if(!hit&&t.expected)fn++;
 });
 return {tests:tests.length,precision:tp/(tp+fp||1),recall:tp/(tp+fn||1),accuracy:matched/tests.length};
}

BG.engine={TODAY:TODAY,isoPlus:isoPlus,esc:esc,escRe:escRe,fmt:fmt,plural:plural,clone:clone,SAMPLE_DRAFT:SAMPLE_DRAFT,
  seedRules:seedRules,templateRules:templateRules,brandName:brandName,seedAll:seedAll,freshSession:freshSession,factStatus:factStatus,allRules:allRules,nextId:nextId,
  runRules:runRules,confLabel:confLabel,score:score,diffHtml:diffHtml,insightRows:insightRows,reliability:reliability};
})();
