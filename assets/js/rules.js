/* Brand rules page: guidelines, terminology, approved facts and the claims register. Admins edit; everyone else reads. */
(function(){
'use strict';
var BG=window.BG,E=BG.engine,esc=E.esc,S=BG.store,UI=BG.ui,sh=BG.shell;
var $=function(id){return document.getElementById(id);};
var tab='guidelines';
var accuracyAi={signature:'',status:'idle',report:null,error:''};
var invitationUrl='';
var TABS=[['guidelines','Guidelines'],['terms','Terminology'],['facts','Approved facts'],['claims','Claims register']];

function save(){return S.saveRules(S.rules);}
function delBtn(id,c){return c.admin?'<button class="btn sm" data-act="edit" data-id="'+id+'">Edit</button> <button class="btn sm danger" data-act="del" data-id="'+id+'" aria-label="Delete '+id+'">Delete</button>':'';}

function table(){
  var R=S.rules,c=sh.can(),h='';
  if(tab==='guidelines'){
    h='<div class="scroll"><table class="tbl"><thead><tr><th>ID</th><th>Rule</th><th>How it is checked</th><th></th></tr></thead><tbody>'+R.guidelines.map(function(g){
      return '<tr><td><span class="chip">'+g.id+'</span></td><td><b>'+esc(g.title)+'</b><br><span class="muted">'+esc(g.text)+'</span></td><td>'+(g.check?'<span class="pill ok">Exact rule check</span>':'<span class="pill brand">Gemini deep check</span>')+'</td><td>'+delBtn(g.id,c)+'</td></tr>';}).join('')+'</tbody></table></div>';
  }else if(tab==='terms'){
    h='<div class="scroll"><table class="tbl"><thead><tr><th>ID</th><th>Avoid</th><th>Use instead</th><th></th></tr></thead><tbody>'+R.terms.map(function(t){
      return '<tr><td><span class="chip">'+t.id+'</span></td><td>'+esc(t.avoid)+'</td><td><b>'+esc(t.good.replace('$1',''))+'</b></td><td>'+delBtn(t.id,c)+'</td></tr>';}).join('')+'</tbody></table></div>';
  }else if(tab==='facts'){
    h='<div class="scroll"><table class="tbl"><thead><tr><th>ID</th><th>Fact</th><th>Owner</th><th>Valid to</th><th></th></tr></thead><tbody>'+R.facts.map(function(f){
      var st=E.factStatus(f);
      return '<tr><td><span class="chip">'+f.id+'</span></td><td><b>'+esc(f.subject)+'</b><br>'+esc(f.display)+'</td><td>'+esc(f.owner)+'</td><td>'+esc(f.expires)+' <span class="pill '+(st==='expired'?'high':st==='soon'?'medium':'ok')+'">'+(st==='expired'?'Expired':st==='soon'?'Expires soon':'Current')+'</span></td><td>'+delBtn(f.id,c)+'</td></tr>';}).join('')+'</tbody></table></div>';
  }else{
    h='<div class="scroll"><table class="tbl"><thead><tr><th>ID</th><th>Claim type</th><th>Evidence on file</th><th></th></tr></thead><tbody>'+R.claims.map(function(cl){
      return '<tr><td><span class="chip">'+cl.id+'</span></td><td><b>'+esc(cl.label)+'</b><br><span class="muted">'+esc(cl.text)+'</span></td><td>'+(cl.evidence?'<span class="pill ok">On file</span> '+esc(cl.evidence):'<span class="pill high">None</span>')+
        (c.admin?'<div class="row" style="margin-top:8px"><input type="text" id="ev-'+cl.id+'" placeholder="e.g. Survey Q3 2026" style="flex:1 1 150px"><button class="btn sm" data-act="evidence" data-id="'+cl.id+'">Save evidence</button></div>':'')+'</td><td>'+delBtn(cl.id,c)+'</td></tr>';}).join('')+'</tbody></table></div>';
  }
  return h;
}
var HELP={guidelines:'Written rules. Exact rule checks run instantly. Rules without one are used by the Gemini deep check.',terms:'Words to avoid and the approved replacement.',facts:'Each fact has an owner and an expiry date. An expired fact is flagged wherever it appears in a draft.',claims:'Risky claims. With no evidence on file, a matching claim is flagged and routed to a reviewer.'};
function aiPanel(){
  var c=sh.can();if(!c.admin)return '';
  var AI=BG.ai,live=S.mode==='firebase';
  var status=AI.server?'<span class="pill ok">Server AI connected</span>':AI.hasLocalKey()?'<span class="pill brand">Personal key on this device</span>':'<span class="pill high">Not configured</span>';
  return '<section class="panel"><div class="row" style="justify-content:space-between"><div><h2>AI engine (Gemini)</h2><p class="small muted">Powers the deep check, the guideline-document import and rule-wording suggestions. Exact rule checks never need it.</p></div><div class="row">'+status+'</div></div>'+
    '<div class="note" style="margin-top:12px">'+(live
      ?'The Gemini key lives on the server as the <span class="mono">GEMINI_API_KEY</span> environment variable. It is never sent to the browser or stored in the database. Every call needs a signed-in account and is rate-limited.'
      :'Local demo mode has no server. Paste a personal Gemini key below to try the AI features. It stays in this browser only.')+'</div>'+
    '<div class="row" style="margin-top:12px"><button class="btn sm" data-act="aiTest">Test connection</button><button class="btn sm" data-act="aiKey">'+(AI.hasLocalKey()?'Change personal key':'Use a personal key on this device')+'</button>'+(AI.hasLocalKey()?'<button class="btn sm danger" data-act="aiKeyClear">Remove personal key</button>':'')+'</div></section>';
}
function teamPanel(){
  var c=sh.can();if(!c.admin||S.mode!=='firebase')return '';
  var users=S.users||[];
  return '<section class="panel"><h2>Team</h2><p class="small muted" style="margin:4px 0 12px">Workspace access is invitation-only. Invite a verified email as a Creator or Reviewer; invitations expire after seven days. Roles are enforced by the database rules, not the browser.</p>'+
    '<div class="row"><div class="field" style="flex:2 1 220px"><label for="inviteEmail">Invite by email</label><input id="inviteEmail" type="email" autocomplete="email" placeholder="colleague@company.com"></div>'+
    '<div class="field"><label for="inviteRole">Workspace role</label><select id="inviteRole"><option>Creator</option><option>Reviewer</option></select></div>'+
    '<button class="btn primary" data-act="sendInvite">Create invite link</button></div>'+
    (invitationUrl?'<div class="note ok" role="status" style="margin-top:10px">Share this private link with the invited person. It expires in seven days.<div class="row" style="margin-top:8px"><input id="inviteLink" type="text" readonly value="'+esc(invitationUrl)+'" aria-label="Invitation link"><button class="btn sm" data-act="copyInvite">Copy link</button></div></div>':'')+
    '<div class="scroll"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>'+(users.length?users.map(function(u){
      return '<tr><td><b>'+esc(u.name||'')+'</b>'+(u.uid===S.user.uid?' <span class="pill">You</span>':'')+'</td><td class="muted">'+esc(u.email||'')+'</td><td><select data-act="setRole" data-uid="'+esc(u.uid)+'" aria-label="Role for '+esc(u.name||u.email||'user')+'">'+['Creator','Reviewer','Admin'].map(function(r){return '<option'+(r===u.role?' selected':'')+'>'+r+'</option>';}).join('')+'</select></td></tr>';
    }).join(''):'<tr><td colspan="3" class="muted">Loading team…</td></tr>')+'</tbody></table></div></section>';
}
function accuracyCache(){try{return JSON.parse(localStorage.getItem('bg.accuracy.v1')||'null');}catch(e){return null;}}
function accuracyStore(value){try{localStorage.setItem('bg.accuracy.v1',JSON.stringify(value));}catch(e){}}
function startAiAccuracy(signature,force){
  if(accuracyAi.signature===signature&&(accuracyAi.status==='running'||accuracyAi.status==='done'||(accuracyAi.status==='error'&&!force)))return;
  var cached=!force&&accuracyCache();
  if(cached&&cached.signature===signature&&cached.report){
    accuracyAi={signature:signature,status:'done',report:cached.report,error:''};return;
  }
  accuracyAi={signature:signature,status:'running',report:null,error:''};
  var rules=E.clone(S.rules),cases=E.accuracyDataset(rules),catalog=E.allRules(rules);
  var prompt='Run a blind accuracy benchmark for BrandGuard. For each numbered DRAFT, report at most one clear issue only when it violates one supplied BRAND RULE. Do not flag acceptable equivalents, supported approximate or qualified facts, or content unrelated to the rules. Do not see or infer expected labels.\n\nBRAND RULES:\n'+
    JSON.stringify(catalog)+'\n\nDRAFTS:\n'+JSON.stringify(cases.map(function(c,index){return {caseId:index,text:c.text};}))+
    '\n\nReturn only a JSON array with one object per draft: {"caseId": number, "finding": null OR {"ruleId": an exact supplied rule ID, "quote": exact copied text, "issue": brief reason, "confidence": number from 0 to 1}}.';
  BG.ai.json(prompt).then(function(rows){
    if(!Array.isArray(rows))throw {code:'invalid_json'};
    var candidates=[],seen={},dropped=0;
    rows.forEach(function(row){
      var index=row&&Number(row.caseId),test=Number.isInteger(index)?cases[index]:null,f=row&&row.finding;
      if(!test||!f)return;
      var rule=catalog.find(function(r){return r.id===String(f.ruleId);});
      if(!rule||typeof f.quote!=='string'||!f.quote||test.text.indexOf(f.quote)<0||!String(f.issue||'').trim()||seen[index]){
        dropped++;return;
      }
      seen[index]=true;
      candidates.push({caseId:index,ruleId:rule.id,quote:f.quote,issue:String(f.issue),confidence:f.confidence,
        context:test.text.slice(0,300)});
    });
    return BG.ai.verifyCandidates(candidates,catalog).then(function(verdicts){
      var accepted={},verified=0;
      candidates.forEach(function(c,index){
        var result=verdicts[index];
        if(result&&result.supported&&result.relevanceConfidence>=0.5){accepted[c.caseId]=c.ruleId;verified++;}
        else dropped++;
      });
      var tp=0,fp=0,fn=0;
      cases.forEach(function(test,index){
        var actual=accepted[index],expected=test.expected;
        if(expected&&actual===expected)tp++;
        else if(expected)fn++;
        if(actual&&actual!==expected)fp++;
      });
      var report={tests:cases.length,positives:cases.filter(function(x){return !!x.expected;}).length,tp:tp,fp:fp,fn:fn,
        precision:tp/(tp+fp||1),recall:tp/(tp+fn||1),verified:verified,dropped:dropped,at:new Date().toISOString()};
      accuracyStore({signature:signature,report:report});
      if(accuracyAi.signature===signature)accuracyAi={signature:signature,status:'done',report:report,error:''};
    });
  }).catch(function(error){
    if(accuracyAi.signature===signature)accuracyAi={signature:signature,status:'error',report:null,error:BG.ai.errorCopy(error)};
  }).then(function(){
    if(accuracyAi.signature===signature)render();
  });
}
function accuracyPanel(){
  if(!sh.can().admin)return '';
  var engine=E.accuracyReport(S.rules),pct=function(n){return Math.round(n*100)+'%';};
  var sig=JSON.stringify(S.rules),ai='';
  if(BG.ai.available){
    var state=accuracyAi.signature===sig?accuracyAi:{signature:sig,status:'pending',report:null,error:''};
    ai='<div class="note" style="margin-top:12px"><b>Gemini + verifier:</b> '+(state.status==='running'?'Running the 60-draft benchmark and independent rule-support checks…':
      state.status==='done'&&state.report?'Precision '+pct(state.report.precision)+' · Recall '+pct(state.report.recall)+' · '+state.report.tp+' true positives, '+state.report.fp+' false positives, '+state.report.fn+' missed · '+E.plural(state.report.verified,'finding')+' passed the relevance check.':
      state.status==='error'?esc(state.error):'The 60-draft benchmark is starting.')+
      '<div class="row" style="margin-top:8px"><button class="btn sm" data-act="aiAccuracyRetry"'+(state.status==='running'?' disabled':'')+'>Rerun AI benchmark</button></div></div>';
  }else{
    ai='<div class="note" style="margin-top:12px"><b>Gemini + verifier:</b> Configure Gemini to run the same labelled drafts through the AI and independent rule-support check.</div>';
  }
  return '<section class="panel"><div class="row" style="justify-content:space-between"><div><h2>Check accuracy</h2><p class="small muted">60 labelled drafts are tested against this brand pack. Results recalculate when the pack changes.</p></div><span class="pill brand">Admin only</span></div>'+
    '<div class="kpis" style="margin-top:12px"><div class="kpi"><b>'+pct(engine.precision)+'</b><span>Rule precision</span></div><div class="kpi"><b>'+pct(engine.recall)+'</b><span>Rule recall</span></div>'+
    '<div class="kpi"><b>'+engine.tp+' / '+engine.positives+'</b><span>Expected findings caught</span></div><div class="kpi"><b>'+engine.fp+'</b><span>False alarms</span></div></div>'+
    '<p class="small muted" style="margin:10px 0 0">Rule engine: '+engine.tests+' labelled cases, '+engine.positives+' expected findings. Gemini candidates are also checked for exact quotes, valid rule IDs and rule relevance before counting.</p>'+ai+'</section>';
}
function setupPanel(){
  var c=sh.can(),R=S.rules;if(!c.admin)return '';
  var empty=!R.terms.length&&!R.facts.length;
  return '<section class="panel"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2>'+(empty?'Set up your brand pack':'Brand pack')+'</h2><p class="small muted" style="max-width:62ch">'+(empty?'Your workspace has the generic checks (tone, absolute claims, readability, accessibility) and no company-specific terms or facts yet. Upload your brand guidelines and Gemini will draft the rules for you to review, or add them by hand.':'Upload an updated guidelines document to add more rules, or edit the lists below.')+'</p>'+
    (empty?'<ol class="small stack" aria-label="First-run setup steps" style="margin:8px 0 0;padding-left:22px"><li><b>Name the workspace</b> in the field below.</li><li><b>Add company rules</b> by importing a guide or editing the lists.</li><li><b>Set visual standards</b> in the section below.</li></ol>':'')+'</div>'+
    '<div class="row"><button class="btn primary" data-act="importDoc"'+(BG.ai.available?'':' title="Needs the AI engine"')+'>Import from guidelines document</button><input type="file" id="guideFile" accept=".pdf,.docx,.txt,.md" hidden></div></div>'+
    '<div class="row" style="margin-top:12px"><label class="small muted" for="companyName">Company name</label><input type="text" id="companyName" value="'+esc(R.company)+'" style="flex:1 1 220px;max-width:340px"><button class="btn sm" data-act="saveCompany">Save</button></div></section>';
}
function visualPanel(){
  if(!sh.can().admin)return '';
  var v=S.rules.visual||{palette:[],contrast:4.5,paletteTolerance:25};
  return '<section class="panel"><div class="row" style="justify-content:space-between"><div><h2>Visual standards</h2><p class="small muted">Set approved brand colors and the minimum WCAG AA contrast ratio for text on images.</p></div><span class="pill brand">V-01 · V-02 · V-03</span></div>'+
    '<div class="field" style="margin-top:12px"><label for="visualPalette">Approved palette (hex colors, comma separated)</label><input id="visualPalette" type="text" value="'+esc((v.palette||[]).join(', '))+'" placeholder="#0D4033, #F5F1E8"></div>'+
    '<div class="row"><div class="field"><label for="visualContrast">Minimum text contrast</label><select id="visualContrast"><option value="4.5"'+(Number(v.contrast||4.5)===4.5?' selected':'')+'>4.5:1 · normal text (WCAG AA)</option><option value="3"'+(Number(v.contrast)===3?' selected':'')+'>3:1 · large text (WCAG AA)</option></select></div>'+
    '<button class="btn primary" data-act="saveVisual">Save visual standards</button></div>'+
    ((v.palette||[]).length?'<div class="row" style="margin-top:10px">'+v.palette.map(function(hex){return '<span class="pill neutral"><i style="display:inline-block;width:14px;height:14px;background:'+esc(hex)+';border-radius:50%;vertical-align:middle;margin-right:5px"></i>'+esc(hex)+'</span>';}).join('')+'</div>':'<div class="empty" style="margin-top:10px">No palette set. Palette checks stay off until you add approved colors.</div>')+
    '<p class="small muted" style="margin:10px 0 0">Palette comparison uses perceptual color distance on up to five dominant image colors. Contrast checks compare the foreground and background colors selected by the creator.</p></section>';
}
function previewImport(p,name,incomplete){
  var cnt=function(n,w){return '<li><b>'+n+'</b> '+w+'</li>';};
  var list=function(arr,fn){return arr.length?'<ul class="small" style="margin:4px 0 10px 18px">'+arr.map(fn).join('')+'</ul>':'';};
  UI.modal('<h2 style="font-size:20px;margin-bottom:6px">Review what Gemini found in '+esc(name)+'</h2><p class="small muted" style="margin-bottom:10px">Nothing is saved until you confirm. Facts need an expiry date, which you can set afterwards.</p>'+
    (incomplete?'<div class="note warn" role="status">'+(p.meta&&p.meta.processedChars<p.meta.totalChars?'Gemini checked '+p.meta.processedChars.toLocaleString()+' of '+p.meta.totalChars.toLocaleString()+' characters in '+p.meta.chunks+' sections. The remaining text was not checked; split the guide into smaller parts to review it all.':'The full document text was checked in '+(p.meta&&p.meta.chunks||1)+' sections, but '+(p.meta&&p.meta.omittedItems||0)+' extracted items exceeded the preview limit. Split the guide or add those rules manually.')+'</div>':'')+
    '<div class="stack" style="max-height:52vh;overflow:auto">'+
    '<div><b>'+p.guidelines.length+' guidelines</b>'+list(p.guidelines,function(g){return '<li><b>'+esc(g.title)+'</b>: '+esc(g.text)+'</li>';})+'</div>'+
    '<div><b>'+p.terms.length+' terms</b>'+list(p.terms,function(t){return '<li>'+esc(t.avoid)+' &rarr; <b>'+esc(t.good)+'</b></li>';})+'</div>'+
    '<div><b>'+p.facts.length+' approved facts</b>'+list(p.facts,function(f){return '<li>'+esc(f.subject)+': <b>'+esc(f.value)+' '+esc(f.noun)+'</b> (owner: '+esc(f.owner)+')</li>';})+'</div>'+
    '<div><b>'+p.claims.length+' risky-claim types</b>'+list(p.claims,function(c){return '<li>'+esc(c.label)+': '+c.words.map(esc).join(', ')+'</li>';})+'</div></div>'+
    '<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-ui="closeModal">Discard</button><button class="btn primary" data-act="confirmImport">Add to brand pack</button></div>');
  pendingImport=p;
}
function mergeImport(p){
  var R=S.rules,exp=E.isoPlus(365),have=function(list,key,val){return list.some(function(x){return String(x[key]).toLowerCase()===String(val).toLowerCase();});};
  if(p.company&&(!R.company||/^Your company|company$/i.test(R.company)))R.company=p.company;
  p.guidelines.forEach(function(g){if(!have(R.guidelines,'title',g.title))R.guidelines.push({id:E.nextId('G',R.guidelines),title:g.title,text:g.text,check:null,category:'Tone'});});
  p.terms.forEach(function(t){if(!have(R.terms,'avoid',t.avoid))R.terms.push({id:E.nextId('T',R.terms),avoid:t.avoid,pattern:E.escRe(t.avoid),good:t.good.replace(/\$/g,'$$$$'),text:'Say "'+t.good+'", not "'+t.avoid+'".'});});
  p.facts.forEach(function(f){if(!have(R.facts,'subject',f.subject))R.facts.push({id:E.nextId('F',R.facts),subject:f.subject,value:f.value,display:f.value+' '+f.noun,pattern:'(\\d[\\d,]*)\\+?\\s+'+E.escRe(f.noun),owner:f.owner,expires:exp});});
  p.claims.forEach(function(c){if(!have(R.claims,'label',c.label))R.claims.push({id:E.nextId('C',R.claims),label:c.label,pattern:c.words.map(E.escRe).join('|'),evidence:'',fix:'a well-regarded',text:c.label+' claims need evidence on file and a reviewer sign-off.'});});
  save();
}
var pendingImport=null;
function render(){
  var c=sh.can(),y=window.scrollY;
  if(c.admin&&BG.ai.available)startAiAccuracy(JSON.stringify(S.rules),false);
  $('page').innerHTML=  '<div class="stack">'+setupPanel()+visualPanel()+aiPanel()+accuracyPanel()+teamPanel()+
    '<div class="note">'+(c.admin?'You are acting as Admin and can edit the brand knowledge.':'Read only. Only an Admin can edit the brand pack.')+' Every finding cites an item below by its ID. Company: <b>'+esc(S.rules.company)+'</b>.</div>'+
    '<div class="row" style="justify-content:space-between"><div class="seg" role="group" aria-label="Rule type">'+TABS.map(function(t){return '<button data-act="tab" data-t="'+t[0]+'" aria-pressed="'+(tab===t[0])+'">'+t[1]+'</button>';}).join('')+'</div>'+
      (c.admin?'<div class="row"><button class="btn primary" data-act="add">Add '+({guidelines:'guideline',terms:'term',facts:'fact',claims:'claim type'})[tab]+'</button>'+
        '<button class="btn" data-act="importPack">Import JSON</button><button class="btn" data-act="exportPack">Export JSON</button>'+
        '<input type="file" id="brandPackFile" accept=".json,application/json" hidden>'+
        (S.mode==='local'?'<button class="btn danger" data-act="reset">Reset demo data</button>':'')+'</div>':'')+'</div>'+
    '<section class="panel"><p class="small muted" style="margin-bottom:10px">'+HELP[tab]+'</p>'+table()+'</section></div>';
  window.scrollTo(0,y);
}
function form(){
  var f=function(id,l,ph,t){return '<div class="field"><label for="'+id+'">'+l+'</label><input type="'+(t||'text')+'" id="'+id+'" placeholder="'+(ph||'')+'"></div>';};
  var body={
    guidelines:f('gTitle','Short title','Respectful language')+'<div class="field"><label for="gText">Rule text</label><textarea id="gText" rows="3" placeholder="Describe what is and is not allowed"></textarea></div>',
    terms:f('tAvoid','Avoid','e.g. users')+f('tGood','Use instead','e.g. members'),
    facts:f('fSubject','Subject','Instructor count')+f('fValue','Number','300')+f('fNoun','Word after the number','instructors')+f('fOwner','Owner','Content team')+f('fExp','Valid to','','date'),
    claims:f('cLabel','Claim type','Award claim')+f('cWords','Phrases to catch, comma separated','award-winning, best in class')
  }[tab];
  UI.modal('<h2 style="font-size:20px;margin-bottom:14px">Add to '+TABS.find(function(t){return t[0]===tab;})[1].toLowerCase()+'</h2><div class="stack">'+body+'<div class="row" style="justify-content:flex-end"><button class="btn" data-ui="closeModal">Cancel</button><button class="btn primary" data-act="submitAdd">Add</button></div></div>');
}

document.addEventListener('click',function(ev){
  var el=ev.target.closest('[data-act]');if(!el)return;
  var a=el.dataset.act,id=el.dataset.id,R=S.rules,v=function(i){return ($(i).value||'').trim();};
  if(a==='tab'){tab=el.dataset.t;render();return;}
  if(a==='aiAccuracyRetry'){startAiAccuracy(JSON.stringify(S.rules),true);render();return;}
  if(a==='saveVisual'){
    var raw=v('visualPalette'),palette=raw?raw.split(',').map(function(x){return x.trim().toUpperCase();}).filter(Boolean):[];
    if(palette.length>10||palette.some(function(x){return !/^#[0-9A-F]{6}$/.test(x);})){UI.toast('Use up to 10 valid hex colors, for example #0D4033, #F5F1E8.');return;}
    R.visual={palette:Array.from(new Set(palette)),contrast:Number($('visualContrast').value),paletteTolerance:25};
    save().then(function(){render();UI.toast('Visual standards saved.');}).catch(function(e){UI.toast('Could not save visual standards: '+(e&&e.message||'Try again.'));});return;}
  if(a==='add'){form();return;}
  if(a==='aiTest'){
    UI.toast('Testing…');
    BG.ai.refresh().then(function(){return BG.ai.text('Reply with the single word: ready');}).then(function(t){UI.toast('Gemini replied: '+String(t).trim().slice(0,40));render();}).catch(function(e){UI.toast(BG.ai.errorCopy(e));render();});
    return;}
  if(a==='aiKey'){
    UI.modal('<h2 style="font-size:20px;margin-bottom:10px">Personal Gemini key</h2><p class="small muted" style="margin-bottom:12px">Stored only in this browser. It is not shared with your team and never written to the database. For a shared deployment, set <span class="mono">GEMINI_API_KEY</span> on the server instead.</p><div class="field"><label for="geminiKey">Gemini API key</label><input type="password" id="geminiKey" autocomplete="off" placeholder="AIza..."></div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-ui="closeModal">Cancel</button><button class="btn primary" data-act="aiKeySave">Save on this device</button></div>');
    return;}
  if(a==='aiKeySave'){var k=v('geminiKey');if(!k){UI.toast('Enter a key.');return;}UI.closeModal();BG.ai.setLocalKey(k).then(function(){render();UI.toast('Key saved on this device.');});return;}
  if(a==='aiKeyClear'){BG.ai.setLocalKey('').then(function(){render();UI.toast('Personal key removed.');});return;}
  if(a==='saveCompany'){var nm=v('companyName');if(!nm){UI.toast('Enter a company name.');return;}R.company=nm;save();UI.toast('Company name saved.');return;}
  if(a==='sendInvite'){
    var email=v('inviteEmail'),role=$('inviteRole').value;
    if(!email){UI.toast('Enter the email address to invite.');return;}
    el.disabled=true;
    S.createInvitation(email,role).then(function(url){invitationUrl=url;render();UI.toast('Invitation link created. Share it only with '+email+'.');})
      .catch(function(error){el.disabled=false;UI.toast('Invitation failed: '+(error&&error.message||'try again'));});
    return;
  }
  if(a==='copyInvite'){
    var input=$('inviteLink');
    if(!input)return;
    input.select();
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(invitationUrl).then(function(){UI.toast('Invitation link copied.');}).catch(function(){UI.toast('Select and copy the invitation link.');});
    else UI.toast('Select and copy the invitation link.');
    return;
  }
  if(a==='importDoc'){
    if(!BG.ai.available){UI.toast('Set up the AI engine first (server key or a personal key).');return;}
    $('guideFile').click();return;}
  if(a==='confirmImport'){if(pendingImport){mergeImport(pendingImport);pendingImport=null;UI.closeModal();render();UI.toast('Brand pack updated. Review the new rules below.');}return;}
  if(a==='exportPack'){
    var blob=new Blob([JSON.stringify({company:S.rules.company,guidelines:S.rules.guidelines,terms:S.rules.terms,facts:S.rules.facts,claims:S.rules.claims,visual:S.rules.visual||{palette:[],contrast:4.5,paletteTolerance:25}},null,2)],{type:'application/json'});
    var url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='brandguard-brand-pack.json';link.click();URL.revokeObjectURL(url);UI.toast('Brand pack exported.');
    return;}
  if(a==='importPack'){ $('brandPackFile').click();return;}
  if(a==='edit'){
    var item=R.guidelines.find(function(x){return x.id===id})||R.terms.find(function(x){return x.id===id})||R.facts.find(function(x){return x.id===id})||R.claims.find(function(x){return x.id===id});
    if(!item)return;
    UI.modal('<h2 style="font-size:20px;margin-bottom:14px">Edit '+id+'</h2><div class="stack"><div class="field"><label for="editRuleText">Rule data</label><textarea id="editRuleText" rows="12">'+esc(JSON.stringify(item,null,2))+'</textarea></div><div class="row" style="justify-content:flex-end"><button class="btn" data-ui="closeModal">Cancel</button><button class="btn primary" data-act="saveEdit" data-id="'+id+'">Save changes</button></div></div>');
    return;}
  if(a==='saveEdit'){
    try{
      var next=JSON.parse($('editRuleText').value);next.id=id;
      if(typeof next.pattern==='string'){try{new RegExp(next.pattern,'i');}catch(pe){throw new Error('the pattern is not a valid expression ('+pe.message+')');}}
      var list=['guidelines','terms','facts','claims'];
      for(var i=0;i<list.length;i++){var p=list[i],j=R[p].findIndex(function(x){return x.id===id});if(j>=0){R[p][j]=next;break;}}
      UI.closeModal();save();render();UI.toast(id+' updated.');
    }catch(e){UI.toast('Invalid JSON: '+e.message);}
    return;}
  if(a==='reset'){if(!window.confirm('Reset the Admin demo account data in this browser? Creator and Reviewer demo data will not be changed.'))return;S.resetDemo().then(function(){UI.toast('Admin demo data reset.');}).catch(function(e){UI.toast('Reset failed: '+(e&&e.message||'try again'));});return;}
  if(a==='del'){if(!window.confirm('Delete '+id+'? Findings that cite it will stop appearing.'))return;['guidelines','terms','facts','claims'].forEach(function(k){R[k]=R[k].filter(function(x){return x.id!==id;});});save();UI.toast(id+' deleted.');return;}
  if(a==='evidence'){var cc=R.claims.find(function(x){return x.id===id;});if(cc){cc.evidence=v('ev-'+id);save();UI.toast(cc.evidence?'Evidence saved. Matching claims no longer need sign-off.':'Evidence cleared.');}return;}
  if(a==='submitAdd'){
    var ok=false;
    if(tab==='guidelines'&&v('gTitle')&&v('gText')){R.guidelines.push({id:E.nextId('G',R.guidelines),title:v('gTitle'),text:v('gText'),check:null,category:'Tone'});ok=true;}
    if(tab==='terms'&&v('tAvoid')&&v('tGood')){R.terms.push({id:E.nextId('T',R.terms),avoid:v('tAvoid'),pattern:E.escRe(v('tAvoid')),good:v('tGood').replace(/\$/g,'$$$$'),text:'Say "'+v('tGood')+'", not "'+v('tAvoid')+'".'});ok=true;}
    if(tab==='facts'&&v('fSubject')&&v('fValue')&&v('fNoun')&&v('fOwner')&&v('fExp')){R.facts.push({id:E.nextId('F',R.facts),subject:v('fSubject'),value:v('fValue'),display:v('fValue')+' '+v('fNoun'),pattern:'(\\d[\\d,]*)\\+?\\s+'+E.escRe(v('fNoun')),owner:v('fOwner'),expires:v('fExp')});ok=true;}
    if(tab==='claims'&&v('cLabel')&&v('cWords')){var w=v('cWords').split(',').map(function(x){return x.trim();}).filter(Boolean);if(w.length){R.claims.push({id:E.nextId('C',R.claims),label:v('cLabel'),pattern:w.map(E.escRe).join('|'),evidence:'',fix:'a well-regarded',text:v('cLabel')+' claims need evidence on file and a reviewer sign-off.'});ok=true;}}
    if(!ok){UI.toast('Fill in every field.');return;}
    UI.closeModal();save();render();UI.toast('Added.');return;}
});

sh.start({page:'rules',title:'Brand rules',sub:'The approved knowledge every finding is checked against.',onReady:render,onData:function(){if(!document.getElementById('modal').classList.contains('on'))render();}});

document.addEventListener('change',function(ev){
  var t=ev.target;
  if(t.dataset&&t.dataset.act==='setRole'){S.setUserRole(t.dataset.uid,t.value).then(function(){UI.toast('Role updated.');}).catch(function(e){UI.toast('Role change failed: '+(e&&e.message||'try again'));render();});return;}
  if(t.id==='guideFile'&&t.files&&t.files[0]){
    var gf=t.files[0],guideIncomplete=false;UI.toast('Reading '+gf.name+'…');
    window.BGDocumentImport.extract(gf).then(function(text){
      if(text.trim().length<80)throw new Error('The file has almost no text.');
      guideIncomplete=text.length>192000;
      return BG.ai.extractRules(text);
    }).then(function(p){
      if(!(p.guidelines.length+p.terms.length+p.facts.length+p.claims.length))throw new Error('No rules were found in that document.');
      previewImport(p,gf.name,guideIncomplete||!!(p.meta&&p.meta.incomplete));
    }).catch(function(e){UI.toast(e&&e.code?BG.ai.errorCopy(e):'Import failed: '+(e&&e.message));}).then(function(){t.value='';});
    return;
  }
});
document.addEventListener('change',function(ev){
  if(ev.target.id!=='brandPackFile'||!ev.target.files||!ev.target.files[0])return;
  var file=ev.target.files[0];
  file.text().then(function(text){
    var pack=JSON.parse(text),R=S.rules;
    ['guidelines','terms','facts','claims'].forEach(function(key){
      if(!Array.isArray(pack[key]))throw new Error(key+' must be an array');
      if(pack[key].some(function(x){return !x.id;}))throw new Error(key+' contains an item without an ID');
      pack[key].forEach(function(x){if(typeof x.pattern==='string'){try{new RegExp(x.pattern,'i');}catch(pe){throw new Error(x.id+' has an invalid pattern');}}});
    });
    if(pack.visual){
      if(!Array.isArray(pack.visual.palette)||pack.visual.palette.length>10||pack.visual.palette.some(function(x){return typeof x!=='string'||!/^#[0-9a-f]{6}$/i.test(x);}))throw new Error('visual.palette must contain up to 10 hex colors');
      if([3,4.5].indexOf(Number(pack.visual.contrast))<0)throw new Error('visual.contrast must be 3 or 4.5');
      R.visual={palette:pack.visual.palette.map(function(x){return x.toUpperCase();}),contrast:Number(pack.visual.contrast),paletteTolerance:25};
    }
    if(pack.company)R.company=String(pack.company);
    ['guidelines','terms','facts','claims'].forEach(function(key){R[key]=pack[key];});
    save();render();UI.toast('Brand pack imported.');
  }).catch(function(e){UI.toast('Import failed: '+e.message);}).then(function(){ev.target.value='';});
});
})();
