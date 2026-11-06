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
function geminiPanel(){
  var c=sh.can();if(!c.admin)return '';
  var gemini=S.rules.gemini||(S.rules.gemini={active:'',keys:[]});
  return '<section class="panel"><div class="row" style="justify-content:space-between"><div><h2>Google Gemini API keys</h2><p class="small muted">Admin manages keys. All workspace users can use the active key on the Review page.</p></div><button class="btn primary sm" data-act="addGeminiKey">Add API key</button></div>'+
    '<div class="note warn" style="margin-top:12px">Prototype warning: browser-side keys are not secret. Use restricted Gemini keys and do not use a production billing key until a server-side proxy is added.</div>'+
    '<div class="stack" style="margin-top:12px">'+(gemini.keys.length?gemini.keys.map(function(k){
      var active=gemini.active===k.id;
      return '<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:10px"><div><b>'+esc(k.name||'Gemini key')+'</b><div class="mono muted">'+esc(k.key?'AI...'+k.key.slice(-6):'No key')+'</div></div><div class="row">'+
        '<button class="btn sm'+(active?' primary':'')+'" data-act="useGeminiKey" data-id="'+k.id+'">'+(active?'Active':'Use for workspace')+'</button>'+
        '<button class="btn sm danger" data-act="removeGeminiKey" data-id="'+k.id+'">Remove</button></div></div>';
    }).join(''):'<div class="empty">No Gemini key configured.</div>')+'</div></section>';
}
function render(){
  var c=sh.can(),y=window.scrollY;
  $('page').innerHTML=  '<div class="stack">'+geminiPanel()+
    '<div class="note">'+(c.admin?'You are acting as Admin and can edit the brand knowledge.':'Read only. Switch to Admin in the sidebar to edit.')+' Every finding cites an item below by its ID. Company: <b>'+esc(S.rules.company)+'</b>.</div>'+
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
  if(a==='addGeminiKey'){
    UI.modal('<h2 style="font-size:20px;margin-bottom:14px">Add Google Gemini API key</h2><div class="stack"><div class="field"><label for="geminiName">Key label</label><input type="text" id="geminiName" placeholder="Hackathon key 1"></div><div class="field"><label for="geminiKey">Gemini API key</label><input type="password" id="geminiKey" autocomplete="off" placeholder="AIza..."></div><div class="row" style="justify-content:flex-end"><button class="btn" data-ui="closeModal">Cancel</button><button class="btn primary" data-act="saveGeminiKey">Add and activate</button></div></div>');
    return;}
  if(a==='saveGeminiKey'){
    var name=v('geminiName'),key=v('geminiKey');
    if(!key){UI.toast('Enter a Gemini API key.');return;}
    var gemini=R.gemini||(R.gemini={active:'',keys:[]});
    var id='gemini-'+Date.now();gemini.keys.push({id:id,name:name||'Gemini key',key:key});gemini.active=id;
    UI.closeModal();save();BG.ai.refresh().then(function(){render();});UI.toast('Gemini key added and activated for the workspace.');
    return;}
  if(a==='useGeminiKey'){R.gemini.active=id;save();BG.ai.refresh().then(function(){render();});UI.toast('Gemini key activated for the workspace.');return;}
  if(a==='removeGeminiKey'){
    var gemini2=R.gemini||(R.gemini={active:'',keys:[]});gemini2.keys=gemini2.keys.filter(function(k){return k.id!==id;});
    if(gemini2.active===id)gemini2.active=gemini2.keys.length?gemini2.keys[0].id:'';
    save();BG.ai.refresh().then(function(){render();});UI.toast('Gemini key removed.');return;}
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
