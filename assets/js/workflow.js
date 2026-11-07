/* Workflow page: kanban of content by status, with a detail drawer for comments, approval and the audit trail. */
(function(){
'use strict';
var BG=window.BG,E=BG.engine,esc=E.esc,S=BG.store,UI=BG.ui,sh=BG.shell;
var $=function(id){return document.getElementById(id);};
var sel=null,editMode=false;
var COLS=[['Draft','Not submitted yet'],['In review','Waiting for a reviewer'],['Changes requested','Back with the creator'],['Approved','Locked and ready to publish']];

function addAudit(d,who,what){d.audit.push({at:new Date().toISOString(),who:who,what:what});}
function latest(d){return d.versions[d.versions.length-1];}

function board(){
  var docs=S.visibleDocs().slice().reverse();
  return '<div class="kanban">'+COLS.map(function(c){
    var items=docs.filter(function(d){return d.status===c[0];});
    return '<section class="col" aria-label="'+c[0]+'"><h3>'+UI.statusPill(c[0])+'<span class="n">'+items.length+'</span></h3><p class="small muted" style="margin:-6px 4px 12px">'+c[1]+'</p>'+
      (items.length?items.map(function(d){
        var v=latest(d);
        return '<button class="dcard" data-act="open" data-id="'+esc(d.id)+'"><b>'+esc(d.title)+'</b><span class="small muted">'+esc(d.type)+' · v'+v.n+' · '+E.fmt(v.at)+'</span>'+
          '<span class="row" style="margin-top:8px">'+(v.summary.high?'<span class="pill high">'+v.summary.high+' high open</span>':'<span class="pill ok">0 high open</span>')+(v.summary.disputed?'<span class="pill neutral">'+v.summary.disputed+' disputed</span>':'')+(d.sample?'<span class="pill neutral">sample</span>':'')+'</span></button>';
      }).join(''):'<div class="small muted" style="padding:10px 6px">Nothing here.</div>')+'</section>';
  }).join('')+'</div>';
}

function detail(d){
  var c=sh.can(),v=latest(d),blockers=v.summary.high,canDecide=c.approve&&d.owner!==S.user.uid&&d.status==='In review',why='';
  if(!c.approve)why='Creators cannot approve their own work. Switch to Reviewer to decide.';
  else if(d.owner===S.user.uid)why='You cannot approve content that you created. Ask another Reviewer.';
  else if(d.status!=='In review')why='Only content that is In review can be decided.';
  else if(blockers>0)why=E.plural(blockers,'high-severity finding')+' still open. Ask the creator to fix or dispute '+(blockers===1?'it':'them')+'.';
  var disp=v.summary.disputedList.map(function(x){return '<li><span class="chip">'+esc(x.ruleId)+'</span> <span class="quote">'+esc(x.quote)+'</span><div class="small muted">Creator says: '+esc(x.reason)+'</div></li>';}).join('');
  var open=v.summary.openList.map(function(x){return '<li><span class="pill '+x.severity+'">'+x.severity+'</span> <span class="chip">'+esc(x.ruleId)+'</span> <span class="quote">'+esc(x.quote)+'</span></li>';}).join('');
  return '<div class="stack">'+
    '<div><div class="row" style="justify-content:space-between"><h2 style="font-size:24px">'+esc(d.title)+'</h2>'+UI.statusPill(d.status)+'</div>'+
    '<div class="small muted" style="margin-top:4px">'+esc(d.type)+' · version '+v.n+' of '+d.versions.length+' · saved by '+esc(v.by)+' on '+E.fmt(v.at)+'</div>'+
    (d.intent?' <div class="small muted" style="margin-top:5px"><b>Creator intent:</b> '+esc(d.intent)+'</div>':'')+'</div>'+
    '<div><div class="sec">Latest version</div>'+(    (c.approve&&d.owner!==S.user.uid&&editMode&&d.status==='In review')?'<textarea id="reviewEditText" rows="12" style="width:100%;resize:vertical">'+esc(v.text)+'</textarea><div class="row"><button class="btn primary sm" data-act="commitEdit" data-id="'+esc(d.id)+'">Commit text edit</button><button class="btn sm" data-act="cancelEdit" data-id="'+esc(d.id)+'">Cancel</button></div>':'<div class="marked" style="max-height:220px">'+esc(v.text)+'</div></div>')+
    '<div><div class="sec">Review summary</div><div class="row"><span class="pill '+(blockers?'high':'ok')+'">'+blockers+' high open</span><span class="pill neutral">'+v.summary.disputed+' disputed</span><span class="pill ok">'+v.summary.resolved+' resolved by creator</span></div></div>'+
    (open?'<div><div class="sec">Still open at submission</div><ul class="stack" style="list-style:none;margin:0;padding:0;gap:8px">'+open+'</ul></div>':'')+
    (disp?'<div><div class="sec">Needs your decision: disputed by the creator</div><ul class="stack" style="list-style:none;margin:0;padding:0;gap:8px">'+disp+'</ul></div>':'')+
    '<div class="row" style="border-top:1px solid var(--line);padding-top:14px"><button class="btn" data-act="openReview" data-id="'+esc(d.id)+'">Open in Review</button>'+
      (c.approve&&d.owner!==S.user.uid&&d.status==='In review'?'<button class="btn" data-act="editText" data-id="'+esc(d.id)+'">Edit text and commit</button>':'')+
      '<button class="btn" data-act="exportReview" data-id="'+esc(d.id)+'">Export review report</button>'+
      (d.status==='Approved'?'<button class="btn primary" data-act="copyApproved" data-id="'+esc(d.id)+'">Copy approved text</button>':'')+
      '<button class="btn primary" data-act="approve" data-id="'+esc(d.id)+'"'+(canDecide&&!blockers?'':' disabled')+'>Approve</button>'+
      '<button class="btn danger" data-act="changes" data-id="'+esc(d.id)+'"'+(canDecide?'':' disabled')+'>Request changes</button></div>'+
    ((c.admin||(c.role==='Creator'&&d.owner===S.user.uid&&(d.status==='Draft'||d.status==='Changes requested')))?'<div><button class="btn danger" data-act="deleteDoc" data-id="'+esc(d.id)+'">Delete document permanently</button></div>':'')+
    (why?'<div class="small muted">'+esc(why)+'</div>':'')+
    '<div><div class="sec">Comments</div>'+
      (d.comments.length?'<ul class="stack" style="list-style:none;margin:0 0 10px;padding:0;gap:10px">'+d.comments.map(function(m){return '<li><b>'+esc(m.by)+'</b> <span class="small muted">'+E.fmt(m.at)+'</span>'+ (m.quote?' <blockquote class="quote small">'+esc(m.quote.slice(0,160))+'</blockquote>':'')+'<div>'+esc(m.text)+'</div></li>';}).join('')+'</ul>':'<div class="small muted" style="margin-bottom:10px">No comments yet.</div>')+
      '<div class="row"><input type="text" id="commentBox" placeholder="Comment as '+esc(c.role)+'" style="flex:1 1 200px"><button class="btn" data-act="comment" data-id="'+esc(d.id)+'">Comment</button></div></div>'+
    '<details><summary class="small muted" style="cursor:pointer">Versions ('+d.versions.length+')</summary><ul class="timeline" style="margin-top:12px">'+
      d.versions.slice().reverse().map(function(x){return '<li>v'+x.n+' · '+E.fmt(x.at)+' · '+x.summary.high+' high open, '+x.summary.disputed+' disputed, '+x.summary.resolved+' resolved</li>';}).join('')+'</ul></details>'+
    '<div><div class="sec">Audit trail</div><ul class="timeline">'+d.audit.slice().reverse().map(function(a){return '<li>'+E.fmt(a.at)+' · <b>'+esc(a.who)+'</b> '+esc(a.what)+'</li>';}).join('')+'</ul></div>'+
  '</div>';
}
function render(){
  var y=window.scrollY;
  $('page').innerHTML=board();window.scrollTo(0,y);
  if(sel&&document.getElementById('drawer').classList.contains('on')){var d=S.visibleDocs().find(function(x){return x.id===sel;});if(d){var keep=($('commentBox')||{}).value;UI.drawer(detail(d));if(keep&&$('commentBox'))$('commentBox').value=keep;}}
}
function find(id){return S.visibleDocs().find(function(x){return x.id===id;});}

document.addEventListener('click',function(ev){
  var el=ev.target.closest('[data-act]');if(!el)return;
  var a=el.dataset.act,id=el.dataset.id,c=sh.can(),d=id?find(id):null;
  if(a==='deleteDoc'&&d){
    var canDelete=c.admin||(c.role==='Creator'&&d.owner===S.user.uid&&(d.status==='Draft'||d.status==='Changes requested'));
    if(!canDelete)return;
    if(!window.confirm('Delete "'+(d.title||'this document')+'" permanently? This cannot be undone.'))return;
    S.deleteDoc(d.id).then(function(){
      UI.closeDrawer();
      sel=null;
      render();
      UI.toast('Document deleted.');
    }).catch(function(e){UI.toast('Delete failed: '+(e&&e.message||'Please try again.'));});
    return;}
  if(a==='editText'&&d){editMode=true;UI.drawer(detail(d));return;}
  if(a==='cancelEdit'&&d){editMode=false;UI.drawer(detail(d));return;}
  if(a==='commitEdit'&&d&&c.approve&&d.owner!==S.user.uid&&d.status==='In review'){
    var text=(($('reviewEditText')||{}).value||'').trim();
    if(!text){UI.toast('The text cannot be empty.');return;}
    var old=latest(d).text;
    if(text===old){UI.toast('Change the text before committing.');return;}
    var copy=JSON.parse(JSON.stringify(latest(d)));
    copy.n=d.versions.length+1;copy.text=text;copy.at=new Date().toISOString();copy.by=c.role;
    copy.summary=copy.summary||{high:0,disputed:0,resolved:0,openList:[],disputedList:[]};
    d.versions.push(copy);addAudit(d,c.role,'Committed text edit as version '+copy.n);
    S.saveDoc(d).then(function(){editMode=false;UI.drawer(detail(d));UI.toast('Text edit committed as version '+copy.n+'.');}).catch(function(e){d.versions.pop();UI.toast('Commit failed: '+(e&&e.message||'Try again.'));});
    return;}
  if(a==='open'&&d){sel=id;UI.drawer(detail(d));return;}
  if(a==='openReview'&&d){try{sessionStorage.setItem('bg.openDoc',id);}catch(e){}location.href='review.html';return;}
  if(a==='exportReview'&&d){
    var v=d.versions[d.versions.length-1],lines=['BrandGuard Review Report','',d.title,d.type,'Status: '+d.status,'Version: '+v.n,'Intent: '+(d.intent||'Not provided'),'','Draft:',v.text,'','Comments:'].concat((d.comments||[]).map(function(m){return '- '+m.by+(m.quote?' on "'+m.quote+'"':'')+': '+m.text;}),['','Audit trail:']).concat((d.audit||[]).map(function(a){return '- '+E.fmt(a.at)+' · '+a.who+' · '+a.what;}));
    var blob=new Blob([lines.join('\n')],{type:'text/plain'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=(d.title||'brandguard-review').replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.txt';link.click();URL.revokeObjectURL(url);UI.toast('Review report exported.');
    return;}
  if(a==='copyApproved'&&d){
    var text=d.versions[d.versions.length-1].text;
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){UI.toast('Approved text copied.');}).catch(function(){UI.toast('Copy failed. Export the review report instead.');});}
    else {var t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();UI.toast('Approved text copied.');}
    return;}
  if(a==='comment'&&d){
    var t=($('commentBox').value||'').trim();if(!t)return;
    d.comments.push({by:c.role,text:t,at:new Date().toISOString()});addAudit(d,c.role,'Commented');    S.saveDoc(d).then(function(){UI.drawer(detail(d));UI.toast('Comment added.');}).catch(function(e){UI.toast('Comment failed: '+(e&&e.message||'Please try again.'));});return;}
  if((a==='approve'||a==='changes')&&d){
    if(!c.approve||d.owner===S.user.uid||d.status!=='In review')return;
    var n=d.versions.length;
    if(a==='approve'){
      if(latest(d).summary.high>0)return;
      d.status='Approved';addAudit(d,c.role,'Approved version '+n);UI.toast('Approved. This version is locked.');
    }else{
      var t2=(($('commentBox')||{}).value||'').trim();
      if(!t2){UI.toast('Write what to change in the comment box, then click Request changes.');return;}
      d.comments.push({by:c.role,text:t2,at:new Date().toISOString()});
      d.status='Changes requested';addAudit(d,c.role,'Requested changes on version '+n);UI.toast('Changes requested.');
    }
    S.saveDoc(d).then(function(){UI.drawer(detail(d));}).catch(function(e){UI.toast('Review decision failed: '+(e&&e.message||'Please try again.'));});return;}
});

sh.start({
  page:'workflow',title:'Workshop',sub:'Your direct workspace for drafts, review decisions and approvals.',
  onReady:function(){
    try{var s=sessionStorage.getItem('bg.selDoc');if(s){sessionStorage.removeItem('bg.selDoc');sel=s;}}catch(e){}
    render();
    if(sel){var d=find(sel);if(d)UI.drawer(detail(d));}
  },
  onData:function(){if(!document.activeElement||document.activeElement.id!=='commentBox')render();}
});
})();
