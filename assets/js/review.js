/* Review page: write a draft, see cited findings, accept / edit / dispute, save versions, submit for approval. */
(function(){
'use strict';
var BG=window.BG,E=BG.engine,esc=E.esc,S=BG.store,UI=BG.ui,sh=BG.shell;
var ss=null;
var U={open:null,aiBusy:false,aiMsg:'',timer:null,filter:'all',busy:false};
var $=function(id){return document.getElementById(id);};
var TYPES=['LinkedIn post','Web page','Email','Press note','Ad copy'];

function persist(){BG.session.save({docId:ss.docId,title:ss.title,type:ss.type,intent:ss.intent,text:ss.text,ai:ss.ai,disputed:ss.disputed,resolved:ss.resolved,aiMeta:ss.aiMeta});}

function recompute(){
  var R=S.rules,rf=E.runRules(ss.text,R),af=[];
  ss.ai.forEach(function(a){
    var i=ss.text.indexOf(a.quote);if(i<0)return;
    var f=Object.assign({},a,{start:i,end:i+a.quote.length,source:'ai'});
    var clash=rf.concat(af).some(function(r){return r.start<f.end&&f.start<r.end;});
    if(!clash)af.push(f);
  });
  var all=rf.concat(af).sort(function(a,b){return a.start-b.start;}),seen={};
  all.forEach(function(f){
    var k=f.ruleId+'|'+f.quote.toLowerCase();seen[k]=(seen[k]||0)+1;
    f.key=k+'|'+seen[k];
    f.status=ss.disputed[f.key]?'disputed':'open';
    f.reason=ss.disputed[f.key]||'';
  });
  ss.findings=all;
}
function ruleText(id){var r=E.allRules(S.rules).find(function(x){return x.id===id;});return r?r.text:'';}
function sumry(){
  var f=ss.findings||[],open=f.filter(function(x){return x.status==='open';});
  return {open:open,high:open.filter(function(x){return x.severity==='high';}),med:open.filter(function(x){return x.severity==='medium';}),low:open.filter(function(x){return x.severity==='low';}),
    disputed:f.filter(function(x){return x.status==='disputed';})};
}
function currentDoc(){return ss.docId?S.visibleDocs().find(function(d){return d.id===ss.docId;}):null;}

/* ---------- views ---------- */
function markedHtml(){
  var t=ss.text,f=ss.findings||[],out='',pos=0;
  if(!t.trim())return '<span class="muted">Nothing to review yet.</span>';
  f.forEach(function(x,i){
    out+=esc(t.slice(pos,x.start));
    out+='<mark class="'+(x.status==='disputed'?'disputed ':'')+x.severity+'" data-act="jump" data-i="'+i+'" title="'+esc(x.ruleId)+'">'+esc(t.slice(x.start,x.end))+'</mark>';
    pos=x.end;
  });
  return out+esc(t.slice(pos));
}
function ringHtml(sc){
  var C=2*Math.PI*40,off=C*(1-sc/100),col=sc>=85?'var(--ok)':sc>=60?'var(--med)':'var(--hi)';
  return '<div class="ring"><svg viewBox="0 0 92 92"><circle class="bg" cx="46" cy="46" r="40" fill="none" stroke-width="8"/><circle class="fg" cx="46" cy="46" r="40" fill="none" stroke="'+col+'" stroke-width="8" stroke-linecap="round" stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'"/></svg><b>'+sc+'</b></div>';
}
function findingsHtml(){
  var f=ss.findings||[],sm=sumry(),sc=E.score(f);
  var label=sc>=85?'Ready to submit':sc>=60?'Needs work':'Not ready';
  var counts={all:f.length,high:f.filter(function(x){return x.severity==='high';}).length,medium:f.filter(function(x){return x.severity==='medium';}).length,low:f.filter(function(x){return x.severity==='low';}).length};
  var head='<div class="panel"><div class="ready">'+ringHtml(sc)+'<div><div class="sec">Brand readiness</div><h2>'+label+'</h2><p class="small muted" style="margin-top:2px">'+
    (sm.open.length?E.plural(sm.open.length,'open finding')+'. '+(sm.high.length?E.plural(sm.high.length,'high-severity item')+' must be fixed or disputed before you can submit.':'No high-severity items.'):'Every checked rule passes.')+
    (sm.disputed.length?' '+sm.disputed.length+' disputed.':'')+(ss.resolved.length?' '+ss.resolved.length+' resolved.':'')+'</p></div></div>'+
    '<div class="filters" role="group" aria-label="Filter findings">'+['all','high','medium','low'].map(function(k){return '<button class="fchip" data-act="filter" data-k="'+k+'" aria-pressed="'+(U.filter===k)+'">'+(k==='all'?'All':k[0].toUpperCase()+k.slice(1))+' '+counts[k]+'</button>';}).join('')+'</div></div>';
  var cards=f.map(function(x,i){return (U.filter==='all'||x.severity===U.filter)?cardHtml(x,i):'';}).join('');
  var body=f.length?(cards||'<div class="empty" style="margin-top:16px">No '+U.filter+'-severity findings.</div>'):'<div class="empty" style="margin-top:16px">'+(ss.text.trim()?'Nothing to fix. Every checked rule passes for this draft.':'Paste a draft to see findings.')+'</div>';
  var ai=ss.aiMeta?'<div class="note" style="margin-top:14px">'+esc(ss.aiMeta)+'</div>':'';
  var res=ss.resolved.length?'<details class="panel" style="margin-top:16px"><summary class="small muted" style="cursor:pointer">Resolved in this session ('+ss.resolved.length+')</summary><ul class="timeline" style="margin-top:12px">'+
    ss.resolved.slice().reverse().map(function(r){return '<li><span class="chip">'+esc(r.ruleId)+'</span> '+esc(r.outcome)+': '+E.diffHtml(r.quote,r.replacement)+'</li>';}).join('')+'</ul></details>':'';
  return head+'<div style="margin-top:16px">'+body+'</div>'+ai+res;
}
function cardHtml(f,i){
  var c=sh.can(),open=U.open&&U.open.key===f.key?U.open.mode:null,dis=f.status==='disputed';
  var h='<article class="fcard '+(dis?'disputed ':'')+f.severity+'" id="card-'+i+'">'+
    '<div class="row" style="justify-content:space-between;margin-bottom:10px"><div class="row"><span class="pill '+f.severity+'">'+f.severity+'</span><span class="small muted">'+esc(f.category)+'</span><span class="chip">'+esc(f.ruleId)+'</span>'+(f.reviewerOnly?'<span class="pill brand">Reviewer sign-off</span>':'')+'</div>'+
    '<span class="small muted" title="How sure the check is">'+(f.source==='ai'?'Gemini, source verified':'Rule check')+' · '+E.confLabel(f)+'</span></div>'+
    '<div class="stack" style="gap:10px">'+
    '<div><div class="sec">Flagged text</div><span class="quote">'+esc(f.quote)+'</span></div>'+
    '<div><div class="sec">Why</div>'+esc(f.why)+'</div>'+
    '<div class="src"><div class="sec">Source</div><span class="mono">'+esc(f.ruleId)+'</span> '+esc(ruleText(f.ruleId))+'</div>';
  if(dis){
    h+='<div class="note">Disputed: '+esc(f.reason)+'</div>'+(c.edit?'<div><button class="btn sm" data-act="reopen" data-i="'+i+'">Reopen</button></div>':'');
  }else{
    h+='<div><div class="sec">Suggested fix</div><div class="diff">'+(f.adviceOnly?(f.source==='ai'&&f.suggestion?esc(f.suggestion):'No automatic rewrite. Edit the text yourself or dispute with a reason.'):E.diffHtml(f.quote,f.suggestion))+'</div></div>';
    if(open==='edit'){
      h+='<div class="field"><label for="editBox">Your wording</label><textarea id="editBox" rows="3">'+esc(f.suggestion||f.quote)+'</textarea></div>'+
        '<div class="row"><button class="btn primary sm" data-act="applyEdit" data-i="'+i+'">Apply my wording</button><button class="btn sm" data-act="cancel">Cancel</button></div>';
    }else if(open==='dispute'){
      h+='<div class="field"><label for="reasonBox">Why is this flag wrong or unclear?</label><textarea id="reasonBox" rows="2" placeholder="A short reason helps the guideline owner improve the rule"></textarea></div>'+
        '<div class="row"><button class="btn primary sm" data-act="applyDispute" data-i="'+i+'">Dispute with this reason</button><button class="btn sm" data-act="cancel">Cancel</button></div>';
    }else{
      var noAccept=!c.edit||f.adviceOnly||f.needsInput;
      h+='<div class="row"><button class="btn primary sm" data-act="accept" data-i="'+i+'"'+(noAccept?' disabled':'')+'>Accept fix</button>'+
        '<button class="btn sm" data-act="edit" data-i="'+i+'"'+(c.edit?'':' disabled')+'>'+(f.needsInput?'Write it':'Edit')+'</button>'+
        '<button class="btn sm danger" data-act="dispute" data-i="'+i+'"'+(c.edit?'':' disabled')+'>Dispute</button>'+
        (f.needsInput?'<span class="small muted">Needs your words: a tool cannot know what the image shows.</span>':'')+'</div>';
    }
  }
  return h+'</div></article>';
}
function render(){
  var c=sh.can(),doc=currentDoc(),locked=!!(doc&&doc.status==='Approved'),y=window.scrollY,canEdit=c.edit&&!locked;
  $('page').innerHTML='<div class="split">'+
    '<section class="panel stack" aria-label="Draft">'+
      '<div class="row" style="justify-content:space-between"><h2>Draft</h2>'+(doc?'<span class="pill brand">'+esc(doc.title)+' · '+esc(doc.status)+'</span>':'<span class="pill neutral">Not saved yet</span>')+'</div>'+
      (locked?'<div class="note"><b>Approved and locked.</b> Copy it or reopen the document to create a new review.</div>':'')+
      '<div class="row"><div class="field" style="flex:2 1 220px"><label for="title">Title</label><input type="text" id="title" value="'+esc(ss.title)+'"'+(canEdit?'':' disabled')+'></div>'+
      '<div class="field" style="flex:1 1 150px"><label for="ctype">Content type</label><select id="ctype"'+(canEdit?'':' disabled')+'>'+TYPES.map(function(t){return '<option'+(t===ss.type?' selected':'')+'>'+t+'</option>';}).join('')+'</select></div></div>'+
      '<div class="field"><label for="intent">Intent <span class="muted">(optional)</span></label><input type="text" id="intent" placeholder="What should this content achieve?" value="'+esc(ss.intent||'')+'"'+(canEdit?'':' disabled')+'></div>'+
      '<div class="field"><label for="draft">Content to review</label><textarea id="draft" spellcheck="false"'+(canEdit?'':' readonly')+'></textarea></div>'+
      '<div class="row"><button class="btn sm" data-act="import">Import text / DOCX / PDF</button><input type="file" id="importFile" accept=".txt,.md,.docx,.pdf,text/plain" hidden>'+
        '<button class="btn sm ghost" data-act="commentSelection"'+(canEdit?'':' disabled')+'>Comment on selected text</button></div>'+
      '<div class="row"><button class="btn primary" data-act="run">Run review</button>'+
        (BG.ai.available?'<button class="btn" data-act="ai"'+(U.aiBusy?' disabled':'')+'>'+(U.aiBusy?'Gemini is reading…':'Deep check with Gemini')+'</button>':'')+
        '<button class="btn ghost" data-act="sample"'+(c.edit?'':' disabled')+'>Load sample draft</button></div>'+
      '<div class="small muted" id="aiMsg">'+esc(U.aiMsg||(BG.ai.available?'Rule checks run live as you type. The deep check catches tone and meaning that keywords miss.':'Rule checks run live as you type.'))+'</div>'+
      '<div><div class="sec">Marked-up draft</div><div class="marked" id="marked">'+markedHtml()+'</div></div>'+
      '<div class="row" style="border-top:1px solid var(--line);padding-top:14px"><button class="btn" data-act="save"'+(canEdit?'':' disabled')+'>Save version</button>'+
        '<button class="btn primary" data-act="submit"'+(canEdit?'':' disabled')+'>Save and submit for approval</button>'+
        (c.edit?'':'<span class="small muted">Reviewers comment and approve in the Workflow tab.</span>')+'</div>'+
    '</section>'+
    '<section aria-label="Findings"><div id="findings">'+findingsHtml()+'</div></section></div>';
  $('draft').value=ss.text;
  window.scrollTo(0,y);
}
function refreshPanes(){recompute();var m=$('marked'),f=$('findings');if(m)m.innerHTML=markedHtml();if(f)f.innerHTML=findingsHtml();}

/* ---------- actions ---------- */
function logEvent(f,outcome,reason){S.addEvent({ruleId:f.ruleId,category:f.category,outcome:outcome,at:new Date().toISOString(),reason:reason||'',by:S.user.role});}
function resolveWith(f,rep,outcome){
  ss.text=ss.text.slice(0,f.start)+rep+ss.text.slice(f.end);
  ss.resolved.push({ruleId:f.ruleId,quote:f.quote,replacement:rep,outcome:outcome});
  ss.ai=ss.ai.filter(function(a){return a.quote!==f.quote;});
  logEvent(f,outcome);U.open=null;recompute();persist();render();
  UI.toast((outcome==='accepted'?'Fix applied':'Your wording applied')+' for '+f.ruleId+'.');
}
function flushPending(){if(U.timer){clearTimeout(U.timer);U.timer=null;recompute();render();return true;}return false;}
function addAudit(d,who,what){d.audit.push({at:new Date().toISOString(),who:who,what:what});}
function saveVersion(){
  if(!ss.title.trim()){UI.toast('Add a title first.');return null;}
  if(!ss.text.trim()){UI.toast('The draft is empty.');return null;}
  recompute();var sm=sumry(),role=S.user.role;
  var summary={high:sm.high.length,disputed:sm.disputed.length,resolved:ss.resolved.length,
    openList:sm.open.slice(0,8).map(function(x){return {ruleId:x.ruleId,severity:x.severity,quote:x.quote};}),
    disputedList:sm.disputed.map(function(x){return {ruleId:x.ruleId,quote:x.quote,reason:x.reason};})};
  var d=currentDoc();
  if(!d){d={id:'d-'+Date.now(),title:ss.title.trim(),type:ss.type,status:'Draft',versions:[],comments:[],audit:[],owner:S.user.uid};ss.docId=d.id;}
  d.title=ss.title.trim();d.type=ss.type;d.intent=ss.intent||'';
  var n=d.versions.length+1;
  d.versions.push({n:n,text:ss.text,at:new Date().toISOString(),by:role,summary:summary});
  addAudit(d,role,'Saved version '+n);
  if(d.status==='Approved'||d.status==='Changes requested'){addAudit(d,'System','Status reset to Draft because the content changed. It needs review again.');d.status='Draft';}
  S.saveDoc(d);persist();return d;
}
function runAI(){
  if(!ss.text.trim()||U.aiBusy)return;
  U.aiBusy=true;U.aiMsg='Gemini is reading the draft against '+E.allRules(S.rules).length+' brand rules. This can take up to a minute.';render();
  var rules=E.allRules(S.rules).map(function(r){return {id:r.id,type:r.kind,rule:r.text};});
  var already=ss.findings.filter(function(f){return f.source==='rule';}).map(function(f){return {ruleId:f.ruleId,quote:f.quote};});
  var prompt='You are a brand-compliance reviewer. Review the DRAFT only against the BRAND RULES below. Do not invent rules.\n\nBRAND RULES (JSON):\n'+JSON.stringify(rules)+
    '\n\nCONTENT TYPE: '+ss.type+'\nCREATOR INTENT: '+(ss.intent||'Not provided')+
    '\n\nDRAFT:\n"""\n'+ss.text.slice(0,6000)+'\n"""\n\nALREADY FOUND BY EXACT CHECKS (do not repeat): '+JSON.stringify(already)+
    '\n\nFind judgement issues the exact checks miss: tone that is too casual or pushy, claims that imply a guarantee or ranking without using the exact words, meaning that contradicts an approved fact or rule.\n'+
    'Reply with only a JSON array. Each item: {"ruleId": one id from BRAND RULES, "quote": text copied EXACTLY from the DRAFT, "issue": one sentence, "suggestion": replacement for the quote that keeps the writer\'s intent, "severity": "high"|"medium"|"low", "confidence": number from 0 to 1}. If nothing else is wrong reply [].';
  BG.ai.json(prompt).then(function(data){
    var list=Array.isArray(data)?data:[],kept=[],dropped=0,dup=0;
    var cat=E.allRules(S.rules);
    list.forEach(function(it){
      var rule=it&&cat.find(function(r){return r.id===String(it.ruleId);});
      var q=it&&typeof it.quote==='string'?it.quote:'',idx=q?ss.text.indexOf(q):-1;
      if(!rule||idx<0||!String(it.issue||'').trim()){dropped++;return;}
      if(ss.findings.some(function(f){return f.source==='rule'&&f.start<idx+q.length&&idx<f.end;})){dup++;return;}
      var sev=['high','medium','low'].indexOf(it.severity)>=0?it.severity:'medium';
      var conf=Math.max(0,Math.min(1,Number(it.confidence)));if(isNaN(conf))conf=0.5;
      var sug=typeof it.suggestion==='string'?it.suggestion:'';
      kept.push({ruleId:rule.id,category:rule.category,severity:sev,quote:q,why:String(it.issue),suggestion:sug,adviceOnly:!sug||sug===q,confidence:conf,reviewerOnly:(rule.category==='Claims'||rule.category==='Facts')&&sev==='high'});
    });
    ss.ai=kept;
    ss.aiMeta='Gemini suggested '+list.length+' issue'+(list.length===1?'':'s')+'. '+kept.length+' passed source verification and are shown. '+dropped+' were dropped because they cited no real rule or quoted text that is not in the draft'+(dup?', and '+dup+' repeated an exact check':'')+'.';
    U.aiMsg='Deep check finished.';
  }).catch(function(e){U.aiMsg=BG.ai.errorCopy(e);}).then(function(){U.aiBusy=false;recompute();persist();render();});
}

document.addEventListener('click',function(ev){
  var el=ev.target.closest('[data-act]');if(!el||!ss)return;
  var a=el.dataset.act,i=el.dataset.i!=null?parseInt(el.dataset.i,10):null,c=sh.can();
  if(['accept','edit','dispute','applyEdit','applyDispute','reopen'].indexOf(a)>=0&&U.timer){flushPending();UI.toast('The draft changed a moment ago. Check the updated findings and try again.');return;}
  if(a==='filter'){U.filter=el.dataset.k;$('findings').innerHTML=findingsHtml();return;}
  if(a==='run'){clearTimeout(U.timer);U.timer=null;recompute();U.aiMsg='';persist();render();var n=sumry().open.length;UI.toast(n?E.plural(n,'open finding')+' to look at.':'No open findings.');return;}
  if(a==='ai'){runAI();return;}
  if(a==='sample'){ss=E.freshSession();U.open=null;U.aiMsg='';recompute();persist();render();UI.toast('Sample draft loaded.');return;}
  if(a==='import'){ $('importFile').click();return;}
  if(a==='commentSelection'){
    var box=$('draft'),start=box.selectionStart,end=box.selectionEnd,quote=ss.text.slice(start,end).trim();
    if(!quote){UI.toast('Select text in the draft first.');return;}
    var text=window.prompt('Comment on "'+quote.slice(0,80)+(quote.length>80?'…':'')+'"');
    if(!text||!text.trim())return;
    var d=currentDoc();
    if(!d){UI.toast('Save the document before adding a passage comment.');return;}
    d.comments=d.comments||[];d.comments.push({by:S.user.role,text:text.trim(),at:new Date().toISOString(),quote:quote});
    addAudit(d,S.user.role,'Added a comment on selected text');
    S.saveDoc(d);UI.toast('Passage comment added.');
    return;}
  if(a==='jump'){var card=$('card-'+i);if(card){U.filter='all';card.scrollIntoView({behavior:'smooth',block:'center'});card.classList.add('flash');setTimeout(function(){card.classList.remove('flash');},1200);}return;}
  if(a==='accept'){var f=ss.findings[i];if(f&&c.edit&&!f.adviceOnly&&!f.needsInput)resolveWith(f,f.suggestion,'accepted');return;}
  if(a==='edit'){U.open={key:ss.findings[i].key,mode:'edit'};$('findings').innerHTML=findingsHtml();return;}
  if(a==='dispute'){U.open={key:ss.findings[i].key,mode:'dispute'};$('findings').innerHTML=findingsHtml();return;}
  if(a==='cancel'){U.open=null;$('findings').innerHTML=findingsHtml();return;}
  if(a==='applyEdit'){
    var f2=ss.findings[i],v=$('editBox').value;
    if(!v.trim()&&f2.suggestion!==''){UI.toast('Write the replacement text first.');return;}
    if(/DESCRIBE THE IMAGE/.test(v)){UI.toast('Replace DESCRIBE THE IMAGE with a real description.');return;}
    if(v===f2.quote){UI.toast('That is the same text. Change it or dispute the flag.');return;}
    resolveWith(f2,v,'edited');return;}
  if(a==='applyDispute'){
    var f3=ss.findings[i],r=($('reasonBox').value||'').trim();
    if(r.length<3){UI.toast('Give a short reason so the guideline owner can learn from it.');return;}
    ss.disputed[f3.key]=r;logEvent(f3,'disputed',r);U.open=null;recompute();persist();render();UI.toast('Disputed. A reviewer will see your reason.');return;}
  if(a==='reopen'){delete ss.disputed[ss.findings[i].key];recompute();persist();render();return;}
  if(a==='save'){var d=saveVersion();if(d){render();UI.toast('Saved as version '+d.versions.length+'.');}return;}
  if(a==='submit'){
    recompute();var sm=sumry();
    if(sm.high.length){UI.toast('Fix or dispute the '+E.plural(sm.high.length,'high-severity finding')+' first.');return;}
    var d2=saveVersion();if(!d2)return;
    d2.status='In review';addAudit(d2,S.user.role,'Submitted version '+d2.versions.length+' for approval');
    S.saveDoc(d2);try{sessionStorage.setItem('bg.selDoc',d2.id);}catch(e){}
    location.href='workflow.html';return;}
});
document.addEventListener('input',function(ev){
  var t=ev.target;if(!ss)return;
  if(t.id==='draft'){
    ss.text=t.value;clearTimeout(U.timer);
    U.timer=setTimeout(function(){U.timer=null;refreshPanes();persist();},350);
  }else if(t.id==='title'){ss.title=t.value;persist();}
  else if(t.id==='intent'){ss.intent=t.value;persist();}
});
document.addEventListener('change',function(ev){if(ev.target.id==='ctype'&&ss){ss.type=ev.target.value;persist();}});
document.addEventListener('change',function(ev){
  if(ev.target.id!=='importFile'||!ev.target.files||!ev.target.files[0]||!ss)return;
  var file=ev.target.files[0],editing=!currentDoc()||currentDoc().status!=='Approved';
  if(!editing){UI.toast('Approved documents are locked.');ev.target.value='';return;}
  U.aiMsg='Importing '+file.name+'…';render();
  window.BGDocumentImport.extract(file).then(function(text){
    ss.text=text.replace(/\r/g,'').trim();ss.title=ss.title||file.name.replace(/\.[^.]+$/,'');
    clearTimeout(U.timer);recompute();persist();render();UI.toast('Imported '+file.name+'.');
  }).catch(function(e){U.aiMsg='Import failed: '+e.message;render();UI.toast('The document could not be imported.');}).then(function(){ev.target.value='';});
});

sh.start({
  page:'review',title:'Review',sub:'Check a draft against the approved brand rules. Every finding cites its source.',
  onReady:function(){
    ss=BG.session.load();
    var pend=null;try{pend=sessionStorage.getItem('bg.openDoc');sessionStorage.removeItem('bg.openDoc');}catch(e){}
    if(pend){var d=S.visibleDocs().find(function(x){return x.id===pend;});if(d){var v=d.versions[d.versions.length-1];ss={docId:d.id,title:d.title,type:d.type,intent:d.intent||'',text:v.text,ai:[],disputed:{},resolved:[],aiMeta:null};}}
    recompute();render();
  },
  onData:function(){if(ss&&!U.timer&&!document.activeElement.matches('#draft,#title,#editBox,#reasonBox')){recompute();render();}},
  onRole:function(){U.open=null;}
});
})();
