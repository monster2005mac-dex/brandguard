/* Workflow page: content list, reviewer decision, comments, versions and audit trail. */
(function(){
var B=BG,S=B.S,U=B.U,esc=B.esc,$=B.$,fmt=B.fmt;

function docDetail(d,c){
  var v=d.versions[d.versions.length-1];
  var blockers=v.summary.high;
  var canDecide=c.approve&&d.status==='In review';
  var why='';
  if(!c.approve)why='Creators cannot approve their own work. Switch to Reviewer to decide.';
  else if(d.status!=='In review')why='Only content that is In review can be decided.';
  else if(blockers>0)why=B.plural(blockers,'high-severity finding')+' still open. Ask the creator to fix or dispute '+(blockers===1?'it':'them')+'.';
  var items=v.summary.disputedList.map(function(x){return '<li><span class="chip">'+esc(x.ruleId)+'</span> <span class="quote">'+esc(x.quote)+'</span> Creator says: '+esc(x.reason)+'</li>';}).join('');
  var open=v.summary.openList.map(function(x){return '<li><span class="pill '+x.severity+'">'+x.severity+'</span> <span class="chip">'+esc(x.ruleId)+'</span> <span class="quote">'+esc(x.quote)+'</span></li>';}).join('');
  return '<div class="panel stack">'+
    '<div class="row between"><h2>'+esc(d.title)+'</h2>'+B.statusPill(d.status)+'</div>'+
    '<div class="small muted">'+esc(d.type)+' · version '+v.n+' of '+d.versions.length+' · saved by '+esc(v.by)+' on '+fmt(v.at)+'</div>'+
    '<div class="stack-sm"><div class="sec">Latest version</div><div class="marked">'+esc(v.text)+'</div></div>'+
    '<div class="stack-sm"><div class="sec">Review summary</div><div class="row"><span class="pill '+(blockers?'high':'ok')+'">'+blockers+' high open</span><span class="pill neutral">'+v.summary.disputed+' disputed</span><span class="pill ok">'+v.summary.resolved+' resolved by creator</span></div></div>'+
    (open?'<div class="stack-sm"><div class="sec">Still open at submission</div><ul class="list stack-sm">'+open+'</ul></div>':'')+
    (items?'<div class="stack-sm"><div class="sec">Needs your decision: disputed by the creator</div><ul class="list stack-sm">'+items+'</ul></div>':'')+
    '<div class="row" style="border-top:1px solid var(--line);padding-top:14px">'+
      '<button class="btn" data-action="openDoc" data-id="'+d.id+'">Open in Review</button>'+
      '<button class="btn primary" data-action="approve" data-id="'+d.id+'"'+(canDecide&&!blockers?'':' disabled')+'>Approve</button>'+
      '<button class="btn danger" data-action="changes" data-id="'+d.id+'"'+(canDecide?'':' disabled')+'>Request changes</button>'+
      (why?'<span class="small muted">'+esc(why)+'</span>':'')+
    '</div>'+
    '<div class="stack-sm"><div class="sec">Comments</div>'+
      (d.comments.length?'<ul class="list stack-sm">'+d.comments.map(function(m){return '<li><b>'+esc(m.by)+'</b> <span class="small muted">'+fmt(m.at)+'</span><div>'+esc(m.text)+'</div></li>';}).join('')+'</ul>':'<div class="small muted">No comments yet.</div>')+
      '<div class="row"><input type="text" id="commentBox" placeholder="Add a comment as '+S.role+'" style="flex:1 1 220px;width:auto"><button class="btn" data-action="comment" data-id="'+d.id+'">Comment</button></div>'+
    '</div>'+
    '<details><summary class="small muted" style="cursor:pointer">Versions ('+d.versions.length+')</summary><ul class="list audit">'+
      d.versions.slice().reverse().map(function(x){return '<li>v'+x.n+' · '+fmt(x.at)+' · '+x.summary.high+' high open, '+x.summary.disputed+' disputed, '+x.summary.resolved+' resolved</li>';}).join('')+'</ul></details>'+
    '<details open><summary class="small muted" style="cursor:pointer">Audit trail</summary><ul class="list audit">'+
      d.audit.slice().reverse().map(function(a){return '<li>'+fmt(a.at)+' · <b>'+esc(a.who)+'</b> '+esc(a.what)+'</li>';}).join('')+'</ul></details>'+
    '<div class="toast" role="status" aria-live="polite">'+esc(U.toast)+'</div>'+
  '</div>';
}

function render(){
  var c=B.can();
  var sel=S.docs.find(function(d){return d.id===U.selDoc;})||S.docs[S.docs.length-1];
  if(sel)U.selDoc=sel.id;
  var list=S.docs.length?S.docs.slice().reverse().map(function(d){
    var v=d.versions[d.versions.length-1];
    return '<button class="doc" data-action="selDoc" data-id="'+d.id+'"'+(sel&&sel.id===d.id?' aria-current="true"':'')+'>'+
      '<span class="row between"><b>'+esc(d.title)+'</b>'+B.statusPill(d.status)+'</span>'+
      '<span class="small muted">'+esc(d.type)+' · v'+v.n+' · '+fmt(v.at)+(d.sample?' · sample':'')+'</span></button>';}).join(''):'<div class="empty">No saved content yet. Save a version from Review.</div>';
  return '<div class="page-head"><div><h1>Workflow</h1><p>Creators submit, reviewers decide. Approval needs a clear queue of high-severity items, and every step is written to the audit trail.</p></div></div>'+
    '<div class="grid-wf"><section aria-label="Content"><div class="sec" style="margin-bottom:10px">Content</div>'+list+'</section>'+
    '<section aria-label="Details">'+(sel?docDetail(sel,c):'<div class="empty">Select content to see its history.</div>')+'</section></div>';
}

B.on({
  selDoc:function(el){U.selDoc=el.dataset.id;B.render();},
  openDoc:function(el){
    var d=S.docs.find(function(x){return x.id===el.dataset.id;});var v=d.versions[d.versions.length-1];
    S.session={docId:d.id,title:d.title,type:d.type,text:v.text,ai:[],disputed:{},resolved:[],aiMeta:null};
    B.recompute();B.saveState();B.go('review.html');
  },
  comment:function(el){
    var t=($('commentBox').value||'').trim();if(!t)return;
    var d=S.docs.find(function(x){return x.id===el.dataset.id;});d.comments.push({by:S.role,text:t,at:new Date().toISOString()});B.addAudit(d,S.role,'Commented');
    B.saveState();B.render();
  },
  approve:function(el){
    var d=S.docs.find(function(x){return x.id===el.dataset.id;});var c=B.can();
    if(!c.approve||d.status!=='In review')return;
    var n=d.versions.length;if(d.versions[n-1].summary.high>0)return;
    d.status='Approved';B.addAudit(d,S.role,'Approved version '+n);B.saveState();B.render();
  },
  changes:function(el){
    var d=S.docs.find(function(x){return x.id===el.dataset.id;});var c=B.can();
    if(!c.approve||d.status!=='In review')return;
    var cb=$('commentBox'),ct=(cb&&cb.value||'').trim();
    if(!ct){B.toast('Add a comment saying what to change, then click Request changes.');return;}
    var n=d.versions.length;
    d.comments.push({by:S.role,text:ct,at:new Date().toISOString()});
    d.status='Changes requested';B.addAudit(d,S.role,'Requested changes on version '+n);B.saveState();B.render();
  }
});
B.page({render:render});
B.boot();
})();
