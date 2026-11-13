/* BrandGuard engine: helpers, brand checks, deterministic rule checks, word diff, readiness score.
   Pure functions, no DOM and no network. Exposed as BG.engine. */
(function(){
'use strict';
var root=typeof window!=='undefined'?window:globalThis;
var BG=root.BG=root.BG||{};
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
    guidelines:[
      {id:'G-01',check:'tone',text:'Use a warm, professional voice without slang.'},
      {id:'G-02',check:'absolutes',text:'Do not promise guaranteed outcomes or absolute results.'},
      {id:'G-03',check:'readability',text:'Keep sentences clear and under 25 words.'},
      {id:'G-04',check:'a11y',text:'Use meaningful link text and describe images with alt text.'}
    ],
    terms:[
      {id:'T-01',pattern:'students',good:'learners',text:'Use learner-focused terminology.'}
    ],
    facts:[
      {id:'F-01',subject:'Learners',value:'48000',display:'48,000 learners',pattern:'(\\d[\\d,]*)\\+?\\s+learners',owner:'Content operations',expires:isoPlus(365)},
      {id:'F-03',subject:'Courses',value:'120',display:'120 courses',pattern:'(\\d[\\d,]*)\\s+courses',owner:'Content operations',expires:isoPlus(365)}
    ],
    visual:{palette:[],contrast:4.5,paletteTolerance:25},
    claims:[
      {id:'C-01',pattern:'(?:India|#1\\s+(?:learning\\s+)?platform|number one)',label:'Ranking',fix:'a leading platform in India',text:'Ranking claims need supporting evidence.'}
    ]
  };
}
/* A real workspace starts from this: the generic exact checks, no invented company facts.
   The Admin adds terms, facts and claims, or imports them from a brand-guidelines document. */
function templateRules(company){
  var r=seedRules();
  r.company=company||'Your company';
  r.terms=[];r.facts=[];
  r.claims=[];
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
function freshSession(){return {docId:null,title:'Untitled draft',type:'LinkedIn post',intent:'',text:SAMPLE_DRAFT,ai:[],disputed:{},resolved:[],aiMeta:null,image:null,visualDisputed:{}};}

/* ---------- rule catalogue (what a finding can cite) ---------- */
function factStatus(f){return f.expires<TODAY?'expired':(f.expires<=isoPlus(30)?'soon':'current');}
function allRules(R){
  var out=[];
  R.guidelines.forEach(function(g){out.push({id:g.id,kind:'guideline',category:g.category||'Tone',text:g.text});});
  R.terms.forEach(function(t){out.push({id:t.id,kind:'terminology',category:'Terminology',text:t.text});});
  R.facts.forEach(function(f){out.push({id:f.id,kind:'approved fact',category:'Facts',text:f.subject+' is '+f.display+' (owner: '+f.owner+', valid to '+f.expires+')'});});
  R.claims.forEach(function(c){out.push({id:c.id,kind:'claims register',category:'Claims',text:c.text});});
  out.push({id:'V-01',kind:'visual rule',category:'Visual identity',text:'Use colors from the approved brand palette.'});
  out.push({id:'V-02',kind:'accessibility rule',category:'Accessibility',text:'Text over images must meet WCAG contrast ratio '+((R.visual&&R.visual.contrast)||4.5)+':1.'});
  out.push({id:'V-03',kind:'accessibility rule',category:'Accessibility',text:'Every uploaded image needs descriptive alt text.'});
  return out;
}
function nextId(prefix,arr){
  var max=0;arr.forEach(function(x){var n=parseInt(x.id.split('-')[1],10);if(n>max)max=n;});
  return prefix+'-'+String(max+1).padStart(2,'0');
}

function numberValue(raw){
  var m=String(raw||'').trim().match(/^([\d,]+(?:\.\d+)?)(?:\s*(k|thousand|lakhs?|lac|million|m|crore|cr))?\+?$/i);
  if(!m)return NaN;
  var n=Number(m[1].replace(/,/g,'')),unit=(m[2]||'').toLowerCase();
  var scale={k:1e3,thousand:1e3,lakh:1e5,lakhs:1e5,lac:1e5,million:1e6,m:1e6,crore:1e7,cr:1e7};
  return n*(scale[unit]||1);
}
function factNoun(f){
  if(f.noun)return String(f.noun).trim();
  var val=String(f.value||''),display=String(f.display||'');
  var i=display.indexOf(val);
  return i>=0?display.slice(i+val.length).trim():display.replace(/^[\d,]+(?:\.\d+)?(?:\s*(?:k|thousand|lakhs?|lac|million|m|crore|cr))?\s*/i,'').trim();
}
function hexRgb(hex){
  var x=String(hex||'').trim().match(/^#?([0-9a-f]{6})$/i);
  if(!x)return null;
  return [parseInt(x[1].slice(0,2),16),parseInt(x[1].slice(2,4),16),parseInt(x[1].slice(4,6),16)];
}
function rgbLab(rgb){
  var channels=rgb.map(function(v){v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
  var x=(channels[0]*0.4124+channels[1]*0.3576+channels[2]*0.1805)/0.95047;
  var y=(channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722);
  var z=(channels[0]*0.0193+channels[1]*0.1192+channels[2]*0.9505)/1.08883;
  var f=function(v){return v>0.008856?Math.pow(v,1/3):7.787*v+16/116;};
  return [116*f(y)-16,500*(f(x)-f(y)),200*(f(y)-f(z))];
}
function colorDistance(a,b){
  var x=hexRgb(a),y=hexRgb(b);
  if(!x||!y)return Infinity;
  var p=rgbLab(x),q=rgbLab(y);
  return Math.sqrt(Math.pow(p[0]-q[0],2)+Math.pow(p[1]-q[1],2)+Math.pow(p[2]-q[2],2));
}
function luminance(hex){
  var rgb=hexRgb(hex);if(!rgb)return NaN;
  var c=rgb.map(function(v){v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
}
function contrastRatio(foreground,background){
  var a=luminance(foreground),b=luminance(background);
  if(!isFinite(a)||!isFinite(b))return NaN;
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}
function visualChecks(image,R){
  var visual=R.visual||{palette:[],contrast:4.5,paletteTolerance:25},colors=image&&Array.isArray(image.colors)?image.colors:[],findings=[];
  if(!image)return findings;
  if(!String(image.alt||'').trim())findings.push({ruleId:'V-03',category:'Accessibility',severity:'medium',quote:'Uploaded image',why:'Add descriptive alt text so screen-reader users understand the image.',suggestion:'',adviceOnly:true,confidence:0.99});
  var palette=(visual.palette||[]).filter(function(c){return !!hexRgb(c);});
  var tolerance=Number(visual.paletteTolerance)||25;
  var mismatch=colors.find(function(c){return palette.length&&!palette.some(function(approved){return colorDistance(c,approved)<=tolerance;});});
  if(mismatch)findings.push({ruleId:'V-01',category:'Visual identity',severity:'medium',quote:mismatch.toUpperCase(),
    why:'This dominant image color is outside the approved palette. Nearest approved color is '+palette.slice().sort(function(a,b){return colorDistance(mismatch,a)-colorDistance(mismatch,b);})[0]+'.',
    suggestion:'Use an approved brand color or confirm with the brand owner.',adviceOnly:true,confidence:0.9});
  if(image.hasText){
    var ratio=contrastRatio(image.foreground,image.background),minimum=Number(visual.contrast)||4.5;
    if(isFinite(ratio)&&ratio<minimum)findings.push({ruleId:'V-02',category:'Accessibility',severity:'high',quote:image.foreground+' on '+image.background,
      why:'Text/background contrast is '+ratio.toFixed(2)+':1; WCAG AA requires at least '+minimum+':1 for normal text.',
      suggestion:'Choose a higher-contrast text or background color.',adviceOnly:true,confidence:0.99,contrast:ratio});
  }
  return findings;
}
function factPattern(f){
  var noun=factNoun(f);
  if(!noun)return null;
  var number='(?:[\\d,]+(?:\\.\\d+)?)(?:\\s*(?:k|thousand|lakhs?|lac|million|m|crore|cr))?\\+?';
  return new RegExp('(?:\\b(over|above|more than|at least|approximately|about|around|nearly|almost|up to|under|less than|below|between)\\s+)?('+number+')(?:\\s*(?:-|–|—|to|and)\\s*('+number+'))?\\s+'+escRe(noun)+'\\b','gi');
}
function factAgrees(m,target){
  var qualifier=String(m[1]||'').toLowerCase(),a=numberValue(m[2]),b=m[3]?numberValue(m[3]):NaN;
  if(/\+$/.test(m[2]))qualifier='at least';
  if(!isFinite(a)||!isFinite(target))return false;
  if(isFinite(b))return target>=Math.min(a,b)&&target<=Math.max(a,b);
  if(qualifier==='over'||qualifier==='above'||qualifier==='more than')return target>a;
  if(qualifier==='at least')return target>=a;
  if(qualifier==='up to'||qualifier==='under'||qualifier==='less than'||qualifier==='below')return target<=a;
  if(qualifier==='about'||qualifier==='approximately'||qualifier==='around'||qualifier==='nearly'||qualifier==='almost'){
    var raw=String(m[2]),step=/\b(?:k|thousand|lakhs?|lac|million|m|crore|cr)\s*$/i.test(raw)?Math.pow(10,Math.floor(Math.log10(a))):Math.pow(10,Math.max(0,Math.floor(Math.log10(a))-1));
    return Math.abs(target-a)<=Math.max(a*0.05,step/2);
  }
  return target===a;
}

/* ---------- deterministic rule checks ---------- */
/* A rule with an invalid pattern is skipped instead of crashing every review. */
function safeRe(p,f){try{return new RegExp(p,f);}catch(e){return null;}}
function runRules(text,R){
  var out=[];
  function add(f){f.source='rule';if(f.confidence==null)f.confidence=0.95;out.push(f);}
  function iter(re,fn){if(!re)return;re.lastIndex=0;var m;while((m=re.exec(text))!==null){if(m[0]===''){re.lastIndex++;continue;}fn(m);}}
  function span(m){return {start:m.index,end:m.index+m[0].length,quote:m[0]};}

  R.guidelines.forEach(function(g){
    if(g.check==='tone'){
      var slang={gonna:'it is going to',wanna:'want to',"super":'very','no-brainer':'easy choice',insane:'remarkable','awesome sauce':'excellent'};
      iter(new RegExp('\\b('+Object.keys(slang).map(escRe).join('|')+')\\b','gi'),function(m){
        if(m[0].toLowerCase()==='super'&&/^\s+[A-Z]/.test(text.slice(m.index+m[0].length)))return;
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
      iter(/\b100\s?%\s+(?!(?:remote|online|virtual|digital|organic|natural|vegan|recycl|renewable|cotton|self-paced|flexible|asynchronous|hybrid)\b)(?=[A-Za-z])/gi,function(m){
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
      iter(/https?:\/\/[^\s"'<>)\]]+/gi,function(m){
        if(/(href|src)\s*=\s*["']?$|\]\($|<$/i.test(text.slice(Math.max(0,m.index-12),m.index)))return;
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
    iter(safeRe('\\b'+t.pattern+'\\b','gi'),function(m){
      var s=span(m);s.ruleId=t.id;s.category='Terminology';s.severity='medium';
      var rep=m[0].replace(new RegExp(t.pattern,'i'),t.good);
      s.suggestion=cap(m[0],rep,text,m.index);
      s.why='"'+m[0]+'" is not the approved term. '+t.text;add(s);
    });
  });

  R.facts.forEach(function(f){
    var st=factStatus(f);
    var re=factPattern(f);
    if(!re&&f.pattern)re=safeRe(f.pattern,'gi');
    if(!re)return;
    iter(re,function(m){
      var s=span(m);s.ruleId=f.id;s.category='Facts';
      var approved=numberValue(f.value);
      if(!factAgrees(m,approved)){
        s.severity='high';
        s.why='Approved '+f.subject.toLowerCase()+' is '+f.display+'. The draft says '+m[0].trim()+'.'+(st==='expired'?' This fact expired on '+f.expires+', so the owner ('+f.owner+') must confirm the current value.':'');
        s.suggestion=f.display;
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
    iter(safeRe(c.pattern,'gi'),function(m){
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
function readinessLabel(findings){
  if(findings.some(function(f){return f.status==='open'&&f.severity==='high';}))return 'Action required';
  var value=score(findings);
  return value>=85?'Ready to submit':value>=60?'Needs work':'Not ready';
}
function canonicalJson(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  return '{'+Object.keys(value).sort().map(function(key){return JSON.stringify(key)+':'+canonicalJson(value[key]);}).join(',')+'}';
}
function fingerprint(value){
  var text=typeof value==='string'?value:canonicalJson(value),a=0x811c9dc5,b=0x9e3779b9;
  for(var i=0;i<text.length;i++){
    var code=text.charCodeAt(i);
    a=Math.imul(a^code,0x01000193);
    b=Math.imul(b^code,0x85ebca6b);
  }
  return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
function checkSnapshot(text,R){
  return runRules(text,R).map(function(f){return {ruleId:f.ruleId,quote:f.quote,severity:f.severity,start:f.start,end:f.end,why:f.why};});
}
function visualSnapshot(image){
  if(!image)return null;
  return {colors:(image.colors||[]).slice(),alt:String(image.alt||''),hasText:!!image.hasText,
    foreground:String(image.foreground||'#000000').toUpperCase(),background:String(image.background||'#FFFFFF').toUpperCase(),
    imageHash:String(image.imageHash||image.hash||'')};
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

function accuracyDataset(R){
  var pairs=[],tone=R.guidelines.find(function(g){return g.check==='tone';}),absolute=R.guidelines.find(function(g){return g.check==='absolutes';}),
    readability=R.guidelines.find(function(g){return g.check==='readability';}),a11y=R.guidelines.find(function(g){return g.check==='a11y';});
  function pair(category,positive,id,negative,negativeId){pairs.push({category:category,positive:positive,expected:id||null,negative:negative,negativeExpected:negativeId||null});}
  ['gonna','wanna','super','insane','awesome sauce'].forEach(function(word,i){
    pair('Tone','We are '+word+' help every learner.',tone&&tone.id,'We plan to help every learner.');
  });
  [
    ['We guarantee results.','We aim to deliver useful results.'],
    ['We guarantee 100% success.','We work toward strong outcomes.'],
    ['Our course guarantees your success.','Our course supports your progress.'],
    ['This is risk-free.','This is easy to try.'],
    ['Get 100% results today.','Get helpful results at your own pace.']
  ].forEach(function(x){pair('Claims',x[0],absolute&&absolute.id,x[1]);});
  [
    'We offer a learning program for people who want to build useful skills through regular practice and steady guidance from experienced instructors throughout the year, with helpful feedback and extra time to practise.',
    'Our learning platform gives people flexible access to practical lessons, helpful resources, experienced instructors, and supportive guidance as they work toward their goals, with regular feedback and extra time to practise.',
    'The program includes clear lessons, useful exercises, friendly support, and regular opportunities to practise new skills at a pace that works for each learner, with helpful feedback and extra time to practise.',
    'Learners can explore practical courses, get support from instructors, practise important skills, and make steady progress with flexible study options throughout the year, with helpful feedback and extra time to practise.'
  ].forEach(function(x){pair('Readability',x,readability&&readability.id,'Our learners can study at their own pace.');});
  [
    ['<img src="course.jpg">','<img src="course.jpg" alt="Online course lesson">'],
    ['![](course.jpg)','![Online course lesson](course.jpg)'],
    ['Click here to see the course.','Visit the course page for details.'],
    ['Read more about the course.','Explore the course details.']
  ].forEach(function(x){pair('Accessibility',x[0],a11y&&a11y.id,x[1]);});
  var termRules=R.terms||[];
  for(var ti=0;ti<4;ti++){
    var t=termRules[ti%Math.max(termRules.length,1)];
    var avoid=t&&(t.avoid||t.pattern)||'account';
    pair('Terminology','Our '+avoid+' can access the course.',t&&t.id,
      t?'Our '+String(t.good||'').replace('$1','')+' can access the course.':'Our members can access the course.');
  }
  var facts=R.facts||[];
  for(var fi=0;fi<4;fi++){
    var f=facts[fi%Math.max(facts.length,1)],n=f?numberValue(f.value):NaN,noun=f?factNoun(f):'learners';
    var wrong=isFinite(n)?String(Math.round(n*1.25)): '60,000';
    pair('Facts',f?wrong+' '+noun:'60,000 learners',f&&f.id,
      f?(n>=1000?'About '+Math.round(n/10000)*10+'k '+noun:f.display):'Our learners can study at their own pace.',
      f&&factStatus(f)==='expired'?f.id:null);
  }
  var claimRules=R.claims||[];
  for(var ci=0;ci<4;ci++){
    var c=claimRules[ci%Math.max(claimRules.length,1)],candidate='';
    if(c){
      var words=['India’s #1 platform','number one platform','India','best in class','award-winning'];
      candidate=words.find(function(w){try{return new RegExp(c.pattern,'i').test(w);}catch(e){return false;}})||'India';
    }
    pair('Claims',c?'Our '+candidate+' learning platform serves customers.':'Our learning platform serves customers.',c&&!c.evidence?c.id:null,
      'Our learning platform supports customers.');
  }
  var cases=[];
  pairs.forEach(function(p){
    cases.push({text:p.positive,expected:p.expected,category:p.category});
    cases.push({text:p.negative,expected:p.negativeExpected||null,category:p.category});
  });
  return cases;
}
function accuracyReport(R){
  var cases=accuracyDataset(R),tp=0,fp=0,fn=0;
  cases.forEach(function(test){
    var actual=runRules(test.text,R).map(function(f){return f.ruleId;});
    if(test.expected){
      if(actual.indexOf(test.expected)>=0)tp++;else fn++;
      actual.forEach(function(id){if(id!==test.expected)fp++;});
    }else fp+=actual.length;
  });
  return {tests:cases.length,positives:cases.filter(function(x){return !!x.expected;}).length,tp:tp,fp:fp,fn:fn,
    precision:tp/(tp+fp||1),recall:tp/(tp+fn||1)};
}

BG.engine={TODAY:TODAY,isoPlus:isoPlus,esc:esc,escRe:escRe,fmt:fmt,plural:plural,clone:clone,SAMPLE_DRAFT:SAMPLE_DRAFT,
  seedRules:seedRules,templateRules:templateRules,brandName:brandName,seedAll:seedAll,freshSession:freshSession,factStatus:factStatus,allRules:allRules,nextId:nextId,
  runRules:runRules,confLabel:confLabel,score:score,readinessLabel:readinessLabel,diffHtml:diffHtml,insightRows:insightRows,reliability:reliability,
  accuracyDataset:accuracyDataset,accuracyReport:accuracyReport,canonicalJson:canonicalJson,checkSnapshot:checkSnapshot,
  fingerprint:fingerprint,visualChecks:visualChecks,visualSnapshot:visualSnapshot,colorDistance:colorDistance,contrastRatio:contrastRatio};
if(typeof module!=='undefined'&&module.exports)module.exports=BG.engine;
})();
