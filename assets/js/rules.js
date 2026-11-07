/* Brand rules page: guidelines, terminology, approved facts and the claims register. Admins edit; everyone else reads. */
(function(){
'use strict';
var BG=window.BG,E=BG.engine,esc=E.esc,S=BG.store,UI=BG.ui,sh=BG.shell;
var $=function(id){return document.getElementById(id);};
var tab='guidelines';
var TABS=[['guidelines','Guidelines'],['terms','Terminology'],['facts','Approved facts'],['claims','Claims register']];

function save(){S.saveRules(S.rules);}
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
  return '<section class="panel"><h2>Team</h2><p class="small muted" style="margin:4px 0 12px">New people sign up as Creators. Make someone a Reviewer so they can approve content. Roles are enforced by the database rules, not the browser.</p>'+
    '<div class="scroll"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>'+(users.length?users.map(function(u){
      return '<tr><td><b>'+esc(u.name||'')+'</b>'+(u.uid===S.user.uid?' <span class="pill">You</span>':'')+'</td><td class="muted">'+esc(u.email||'')+'</td><td><select data-act="setRole" data-uid="'+esc(u.uid)+'" aria-label="Role for '+esc(u.name||u.email||'user')+'">'+['Creator','Reviewer','Admin'].map(function(r){return '<option'+(r===u.role?' selected':'')+'>'+r+'</option>';}).join('')+'</select></td></tr>';
    }).join(''):'<tr><td colspan="3" class="muted">Loading team…</td></tr>')+'</tbody></table></div></section>';
}
function setupPanel(){
  var c=sh.can(),R=S.rules;if(!c.admin)return '';
  var empty=!R.terms.length&&!R.facts.length;
  return '<section class="panel"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2>'+(empty?'Set up your brand pack':'Brand pack')+'</h2><p class="small muted" style="max-width:62ch">'+(empty?'Your workspace has the generic checks (tone, absolute claims, readability, accessibility) and no company-specific terms or facts yet. Upload your brand guidelines and Gemini will draft the rules for you to review, or add them by hand.':'Upload an updated guidelines document to add more rules, or edit the lists below.')+'</p></div>'+
    '<div class="row"><button class="btn primary" data-act="importDoc"'+(BG.ai.available?'':' title="Needs the AI engine"')+'>Import from guidelines document</button><input type="file" id="guideFile" accept=".pdf,.docx,.txt,.md" hidden></div></div>'+
    '<div class="row" style="margin-top:12px"><label class="small muted" for="companyName">Company name</label><input type="text" id="companyName" value="'+esc(R.company)+'" style="flex:1 1 220px;max-width:340px"><button class="btn sm" data-act="saveCompany">Save</button></div></section>';
}
function previewImport(p,name){
  var cnt=function(n,w){return '<li><b>'+n+'</b> '+w+'</li>';};
  var list=function(arr,fn){return arr.length?'<ul class="small" style="margin:4px 0 10px 18px">'+arr.map(fn).join('')+'</ul>':'';};
  UI.modal('<h2 style="font-size:20px;margin-bottom:6px">Review what Gemini found in '+esc(name)+'</h2><p class="small muted" style="margin-bottom:10px">Nothing is saved until you confirm. Facts need an expiry date, which you can set afterwards.</p>'+
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
  $('page').innerHTML=  '<div class="stack">'+setupPanel()+aiPanel()+teamPanel()+
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
  if(a==='importDoc'){
    if(!BG.ai.available){UI.toast('Set up the AI engine first (server key or a personal key).');return;}
    $('guideFile').click();return;}
  if(a==='confirmImport'){if(pendingImport){mergeImport(pendingImport);pendingImport=null;UI.closeModal();render();UI.toast('Brand pack updated. Review the new rules below.');}return;}
  if(a==='exportPack'){
    var blob=new Blob([JSON.stringify({company:S.rules.company,guidelines:S.rules.guidelines,terms:S.rules.terms,facts:S.rules.facts,claims:S.rules.claims},null,2)],{type:'application/json'});
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
      var list=['guidelines','terms','facts','claims'];
      for(var i=0;i<list.length;i++){var p=list[i],j=R[p].findIndex(function(x){return x.id===id});if(j>=0){R[p][j]=next;break;}}
      UI.closeModal();save();render();UI.toast(id+' updated.');
    }catch(e){UI.toast('Invalid JSON: '+e.message);}
    return;}
  if(a==='reset'){S.resetDemo().then(function(){UI.toast('Demo data reset.');});return;}
  if(a==='del'){['guidelines','terms','facts','claims'].forEach(function(k){R[k]=R[k].filter(function(x){return x.id!==id;});});save();UI.toast(id+' deleted.');return;}
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
  if(t.dataset&&t.dataset.act==='setRole'){S.setUserRole(t.dataset.uid,t.value).then(function(){UI.toast('Role updated.');});return;}
  if(t.id==='guideFile'&&t.files&&t.files[0]){
    var gf=t.files[0];UI.toast('Reading '+gf.name+'…');
    window.BGDocumentImport.extract(gf).then(function(text){
      if(text.trim().length<80)throw new Error('The file has almost no text.');
      return BG.ai.extractRules(text);
    }).then(function(p){
      if(!(p.guidelines.length+p.terms.length+p.facts.length+p.claims.length))throw new Error('No rules were found in that document.');
      previewImport(p,gf.name);
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
    });
    if(pack.company)R.company=String(pack.company);
    ['guidelines','terms','facts','claims'].forEach(function(key){R[key]=pack[key];});
    save();render();UI.toast('Brand pack imported.');
  }).catch(function(e){UI.toast('Import failed: '+e.message);}).then(function(){ev.target.value='';});
});
})();
