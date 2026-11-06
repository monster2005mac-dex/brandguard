/* Review page: draft editor, live marked-up draft, cited findings with accept / edit / dispute. */
(function(){
var B=BG,S=B.S,U=B.U,esc=B.esc,$=B.$;

function markedHtml(){
  var ss=S.session,t=ss.text,f=ss.findings||[],out='',pos=0;
  if(!t.trim())return '<span class="muted">Nothing to review yet.</span>';
  f.forEach(function(x,i){
    out+=esc(t.slice(pos,x.start));
    out+='<mark class="'+(x.status==='disputed'?'disputed ':'')+x.severity+'" data-action="jump" data-i="'+i+'" title="'+esc(x.ruleId)+'">'+esc(t.slice(x.start,x.end))+'</mark>';
    pos=x.end;
  });
  return out+esc(t.slice(pos));
}

function cardHtml(f,i){
  var c=B.can(),open=U.openCard&&U.openCard.key===f.key?U.openCard.mode:null;
  var rule=B.ruleById(f.ruleId),dis=f.status==='disputed';
  var h='<article class="card '+(dis?'disputed ':'')+f.severity+'" id="card-'+i+'">'+
    '<div class="row between" style="margin-bottom:10px"><div class="row">'+
      '<span class="pill '+f.severity+'">'+f.severity+'</span>'+
      '<span class="small muted">'+esc(f.category)+'</span>'+
      '<span class="chip">'+esc(f.ruleId)+'</span>'+
      (f.reviewerOnly?'<span class="pill accent">Reviewer sign-off</span>':'')+
    '</div><span class="small muted" title="How sure the check is">'+(f.source==='ai'?'Claude, source verified':'Rule check')+' · '+B.confLabel(f)+'</span></div>'+
    '<div class="stack" style="gap:10px">'+
      '<div class="stack-sm"><div class="sec">Flagged text</div><div><span class="quote">'+esc(f.quote)+'</span></div></div>'+
      '<div>'+esc(f.why)+'</div>'+
      '<div class="src"><div class="sec">Source</div><span class="mono">'+esc(f.ruleId)+'</span> '+esc(rule?rule.text:'')+'</div>';
  if(dis){
    h+='<div class="note">Disputed: '+esc(f.reason)+'</div>'+(c.edit?'<div><button class="btn sm" data-action="reopen" data-i="'+i+'">Reopen</button></div>':'');
  }else{
    h+='<div class="stack-sm"><div class="sec">Suggested fix</div>'+(f.adviceOnly?
         '<div class="diff">'+(f.source==='ai'&&f.suggestion?esc(f.suggestion):'No automatic rewrite. Edit the text yourself or dispute with a reason.')+'</div>':
         '<div class="diff">'+B.diffHtml(f.quote,f.suggestion)+'</div>')+'</div>';
    if(open==='edit'){
      h+='<div class="field"><label for="editBox">Your wording</label><textarea id="editBox" rows="3">'+esc(f.suggestion||f.quote)+'</textarea></div>'+
         '<div class="row"><button class="btn primary sm" data-action="applyEdit" data-i="'+i+'">Apply my wording</button><button class="btn sm" data-action="cancel">Cancel</button></div>';
    }else if(open==='dispute'){
      h+='<div class="field"><label for="reasonBox">Why is this flag wrong or unclear?</label><textarea id="reasonBox" rows="2" placeholder="A short reason helps the guideline owner improve the rule"></textarea></div>'+
         '<div class="row"><button class="btn primary sm" data-action="applyDispute" data-i="'+i+'">Dispute with this reason</button><button class="btn sm" data-action="cancel">Cancel</button></div>';
    }else{
      var noAccept=!c.edit||f.adviceOnly||f.needsInput;
      h+='<div class="row">'+
        '<button class="btn primary sm" data-action="accept" data-i="'+i+'"'+(noAccept?' disabled':'')+'>Accept fix</button>'+
        '<button class="btn sm" data-action="edit" data-i="'+i+'"'+(c.edit?'':' disabled')+'>'+(f.needsInput?'Write it':'Edit')+'</button>'+
        '<button class="btn sm danger" data-action="dispute" data-i="'+i+'"'+(c.edit?'':' disabled')+'>Dispute</button>'+
        (f.needsInput?'<span class="small muted">Needs your words. A tool cannot know what the image shows.</span>':'')+
      '</div>';
    }
  }
  return h+'</div></article>';
}

function findingsHtml(){
  var ss=S.session,f=ss.findings||[],sm=B.summaryOf();
  var head='<div class="summary"><h2>Findings</h2>'+
    (sm.open.length?'<span class="pill high">'+sm.high.length+' high</span><span class="pill medium">'+sm.open.filter(function(x){return x.severity==='medium';}).length+' medium</span><span class="pill low">'+sm.open.filter(function(x){return x.severity==='low';}).length+' low</span>':'<span class="pill ok">No open findings</span>')+
    (sm.disputed.length?'<span class="pill neutral">'+sm.disputed.length+' disputed</span>':'')+
    (sm.resolved?'<span class="pill ok">'+sm.resolved+' resolved</span>':'')+'</div>';
  var body=f.length?f.map(cardHtml).join(''):'<div class="empty">'+(ss.text.trim()?'Nothing to fix. Every checked rule passes for this draft.':'Paste a draft to see findings.')+'</div>';
  var ai=ss.aiMeta?'<div class="note" style="margin-top:14px">'+esc(ss.aiMeta)+'</div>':'';
  var res=ss.resolved.length?'<details style="margin-top:16px"><summary class="small muted" style="cursor:pointer">Resolved in this session ('+ss.resolved.length+')</summary><ul class="list audit">'+
    ss.resolved.slice().reverse().map(function(r){return '<li><span class="chip">'+esc(r.ruleId)+'</span> '+esc(r.outcome)+': '+B.diffHtml(r.quote,r.replacement)+'</li>';}).join('')+'</ul></details>':'';
  return head+body+ai+res;
}

function render(){
  var ss=S.session,c=B.can(),doc=B.currentDoc();
  var types=['LinkedIn post','Web page','Email','Press note','Ad copy'];
  return '<div class="page-head"><div><h1>Review</h1><p>Paste a draft. Every flag cites the exact brand rule behind it, and nothing changes until a person clicks.</p></div></div>'+
  '<div class="grid2">'+
   '<section class="panel stack" aria-label="Draft">'+
     '<div class="row between"><h2>Draft</h2>'+(doc?'<span class="pill accent">'+esc(doc.title)+' · '+esc(doc.status)+'</span>':'<span class="pill neutral">Not saved yet</span>')+'</div>'+
     '<div class="row"><div class="field" style="flex:2 1 220px"><label for="title">Title</label><input type="text" id="title" value="'+esc(ss.title)+'"'+(c.edit?'':' disabled')+'></div>'+
       '<div class="field" style="flex:1 1 150px"><label for="ctype">Content type</label><select id="ctype"'+(c.edit?'':' disabled')+'>'+types.map(function(t){return '<option'+(t===ss.type?' selected':'')+'>'+t+'</option>';}).join('')+'</select></div></div>'+
     '<div class="field"><label for="draft">Content to review</label><textarea id="draft" spellcheck="false"'+(c.edit?'':' readonly')+'></textarea></div>'+
     '<div class="row">'+
       '<button class="btn primary" data-action="run">Run review</button>'+
       (U.aiAvail?'<button class="btn" data-action="ai"'+(U.aiBusy?' disabled':'')+'>'+(U.aiBusy?'Claude is reading…':'Deep check with Claude')+'</button>':'')+
       '<button class="btn" data-action="sample"'+(c.edit?'':' disabled')+'>Load sample draft</button>'+
     '</div>'+
     '<div class="small muted">'+esc(U.aiMsg||(U.aiAvail===false?'Deep check with Claude is not available here. Rule checks still run live as you type.':'Rule checks run live as you type.'))+'</div>'+
     '<div class="stack-sm"><div class="sec">Marked-up draft</div><div class="marked" id="marked">'+markedHtml()+'</div></div>'+
     '<div class="row" style="border-top:1px solid var(--line);padding-top:14px">'+
       '<button class="btn" data-action="save"'+(c.edit?'':' disabled')+'>Save version</button>'+
       '<button class="btn primary" data-action="submit"'+(c.edit?'':' disabled')+'>Save and submit for approval</button>'+
       (c.edit?'':'<span class="small muted">Reviewers comment and approve in Workflow.</span>')+
     '</div>'+
     '<div class="toast" role="status" aria-live="polite">'+esc(U.toast)+'</div>'+
   '</section>'+
   '<section aria-label="Findings"><div id="findings">'+findingsHtml()+'</div></section>'+
  '</div>';
}

function refreshPanes(){
  B.recompute();
  var m=$('marked'),f=$('findings');
  if(m)m.innerHTML=markedHtml();
  if(f)f.innerHTML=findingsHtml();
}
function resolveWith(f,replacement,outcome){
  var ss=S.session;
  ss.text=ss.text.slice(0,f.start)+replacement+ss.text.slice(f.end);
  ss.resolved.push({ruleId:f.ruleId,quote:f.quote,replacement:replacement,outcome:outcome});
  ss.ai=ss.ai.filter(function(a){return a.quote!==f.quote;});
  B.logEvent(f,outcome);
  U.openCard=null;B.recompute();B.saveState();B.render();
  B.toast((outcome==='accepted'?'Fix applied':'Your wording applied')+'. Rule '+f.ruleId+' recorded.');
}
function guard(){
  if(U.timer){clearTimeout(U.timer);U.timer=null;B.recompute();B.render();B.toast('The draft changed a moment ago. Check the updated findings and try again.');return true;}
  return false;
}

B.on({
  tab:function(){},
  run:function(){clearTimeout(U.timer);U.timer=null;B.recompute();U.aiMsg='';B.saveState();B.render();var n=B.summaryOf().open.length;B.toast(n?B.plural(n,'open finding')+' to look at.':'No open findings.');},
  ai:function(){B.runAI();},
  sample:function(){B.loadSample();B.render();B.toast('Sample draft loaded.');},
  jump:function(el){var card=$('card-'+el.dataset.i);if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.classList.add('flash');setTimeout(function(){card.classList.remove('flash');},1200);}},
  accept:function(el){if(guard())return;var f=S.session.findings[+el.dataset.i];if(f&&B.can().edit&&!f.adviceOnly&&!f.needsInput)resolveWith(f,f.suggestion,'accepted');},
  edit:function(el){if(guard())return;U.openCard={key:S.session.findings[+el.dataset.i].key,mode:'edit'};B.render();},
  dispute:function(el){if(guard())return;U.openCard={key:S.session.findings[+el.dataset.i].key,mode:'dispute'};B.render();},
  cancel:function(){U.openCard=null;B.render();},
  applyEdit:function(el){
    if(guard())return;
    var f=S.session.findings[+el.dataset.i],v=$('editBox').value;
    if(!v.trim()&&f.suggestion!==''){B.toast('Write the replacement text first.');return;}
    if(/DESCRIBE THE IMAGE/.test(v)){B.toast('Replace DESCRIBE THE IMAGE with a real description.');return;}
    if(v===f.quote){B.toast('That is the same text. Change it or dispute the flag.');return;}
    resolveWith(f,v,'edited');
  },
  applyDispute:function(el){
    if(guard())return;
    var f=S.session.findings[+el.dataset.i],r=($('reasonBox').value||'').trim();
    if(r.length<3){B.toast('Give a short reason so the guideline owner can learn from it.');return;}
    S.session.disputed[f.key]=r;B.logEvent(f,'disputed',r);U.openCard=null;B.recompute();B.saveState();B.render();B.toast('Disputed. A reviewer will see your reason.');
  },
  reopen:function(el){if(guard())return;var f=S.session.findings[+el.dataset.i];delete S.session.disputed[f.key];B.recompute();B.saveState();B.render();},
  save:function(){var d=B.saveVersion();if(d){B.render();B.toast('Saved as version '+d.versions.length+'.');}},
  submit:function(){
    B.recompute();var sm=B.summaryOf();
    if(sm.high.length){B.toast('Fix or dispute the '+B.plural(sm.high.length,'high-severity finding')+' first.');return;}
    var d=B.saveVersion();if(!d)return;
    d.status='In review';B.addAudit(d,S.role,'Submitted version '+d.versions.length+' for approval');
    U.selDoc=d.id;B.saveState();B.go('workflow.html');
  }
});

document.addEventListener('input',function(ev){
  var t=ev.target;
  if(t.id==='draft'){
    S.session.text=t.value;
    clearTimeout(U.timer);U.timer=setTimeout(function(){U.timer=null;refreshPanes();B.saveState();},350);
  }else if(t.id==='title'){S.session.title=t.value;B.saveState();}
});
document.addEventListener('change',function(ev){if(ev.target.id==='ctype'){S.session.type=ev.target.value;B.saveState();}});

B.page({render:render,after:function(){var ta=$('draft');if(ta)ta.value=S.session.text;}});
B.boot();
})();
