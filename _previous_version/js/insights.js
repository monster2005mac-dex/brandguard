/* Insights page: recurring mistakes, expired facts, and guideline gaps (rules creators keep disputing). */
(function(){
var B=BG,S=B.S,U=B.U,esc=B.esc;

function render(){
  var ev=S.events,rows=B.insightRows();
  var tot=ev.length,disp=ev.filter(function(e){return e.outcome==='disputed';}).length;
  var cats={};ev.forEach(function(e){cats[e.category]=(cats[e.category]||0)+1;});
  var catRows=Object.keys(cats).sort(function(a,b){return cats[b]-cats[a];});
  var max=Math.max.apply(null,catRows.map(function(k){return cats[k];}).concat([1]));
  var stale=S.rules.facts.filter(function(f){return B.factStatus(f)!=='current';});
  var gaps=rows.filter(function(r){return r.gap;});
  var nSample=ev.filter(function(e){return e.sample;}).length;
  return '<div class="page-head"><div><h1>Insights</h1><p>Built from every Accept, Edit and Dispute. When creators keep disputing a rule, the rule is probably unclear, so the fix belongs in the guideline.</p></div></div>'+
   (nSample?'<div class="note" style="margin-bottom:18px">The first '+nSample+' events are sample history so these screens are not empty. Your own review actions add to them.</div>':'')+
   '<div class="kpis">'+
     '<div class="kpi"><b>'+tot+'</b><span>findings resolved</span></div>'+
     '<div class="kpi"><b>'+(tot?Math.round((tot-disp)/tot*100):0)+'%</b><span>fixed by the creator</span></div>'+
     '<div class="kpi"><b>'+(tot?Math.round(disp/tot*100):0)+'%</b><span>disputed</span></div>'+
     '<div class="kpi"><b>'+stale.length+'</b><span>facts expired or expiring</span></div></div>'+
   '<div class="grid2" style="margin-bottom:22px">'+
     '<section class="panel"><h3 style="margin-bottom:14px">Recurring mistakes by category</h3><div class="bars">'+
       (catRows.length?catRows.map(function(k){return '<div class="bar-row"><span>'+esc(k)+'</span><div class="track"><div class="fill" style="width:'+Math.round(cats[k]/max*100)+'%"></div></div><span class="mono">'+cats[k]+'</span></div>';}).join(''):'<div class="empty">No history yet.</div>')+
     '</div></section>'+
     '<section class="panel"><h3 style="margin-bottom:14px">Facts that need an owner</h3>'+
       (stale.length?'<ul class="list stack">'+stale.map(function(f){var st=B.factStatus(f);return '<li><span class="chip">'+f.id+'</span> <b>'+esc(f.subject)+'</b> <span class="pill '+(st==='expired'?'high':'medium')+'">'+(st==='expired'?'Expired '+f.expires:'Expires '+f.expires)+'</span><div class="small muted">Owner: '+esc(f.owner)+'</div></li>';}).join('')+'</ul>':'<div class="empty">All facts are current.</div>')+
     '</section></div>'+
   '<section class="panel" style="margin-bottom:22px"><h3>Guideline gaps</h3><p class="small muted" style="margin:3px 0 4px">A rule is flagged here when at least two disputes make up half or more of its outcomes.</p>'+
     (gaps.length?gaps.map(function(r){
        var rule=B.ruleById(r.ruleId),g=U.gap[r.ruleId];
        return '<div class="card medium" style="margin-top:14px"><div class="row between"><div class="row"><span class="chip">'+r.ruleId+'</span><b>Disputed '+Math.round(r.rate*100)+'% of the time</b><span class="small muted">('+r.disputed+' of '+r.total+')</span></div></div>'+
          '<div style="margin:8px 0">'+esc(rule?rule.text:'')+'</div>'+
          '<div class="sec">What creators said</div><ul class="list small" style="margin:4px 0 10px">'+r.reasons.slice(0,4).map(function(x){return '<li>“'+esc(x)+'”</li>';}).join('')+'</ul>'+
          (g?'<div class="note"><div class="sec">Suggested clearer wording (Claude)</div>'+esc(g)+'</div><div class="row" style="margin-top:10px">'+(B.can().admin?'<button class="btn primary sm" data-action="applyGap" data-id="'+r.ruleId+'">Use this wording</button>':'<span class="small muted">Switch to Admin to apply.</span>')+'</div>':
            (U.aiAvail?'<button class="btn sm" data-action="gap" data-id="'+r.ruleId+'"'+(U.gapBusy===r.ruleId?' disabled':'')+'>'+(U.gapBusy===r.ruleId?'Claude is reading…':'Suggest clearer wording with Claude')+'</button>':'<span class="small muted">Rewrite this rule with examples of what is and is not allowed.</span>'))+
        '</div>';}).join(''):'<div class="empty" style="margin-top:14px">No rule is disputed often enough to look unclear.</div>')+
   '</section>'+
   '<section class="panel"><h3 style="margin-bottom:12px">All rules by activity</h3><div class="scroll"><table class="tbl"><thead><tr><th>Rule</th><th>Category</th><th>Resolved</th><th>Fixed</th><th>Disputed</th></tr></thead><tbody>'+
     rows.map(function(r){return '<tr><td><span class="chip">'+r.ruleId+'</span></td><td>'+esc(r.category)+'</td><td>'+r.total+'</td><td>'+r.fixed+'</td><td>'+r.disputed+(r.gap?' <span class="pill medium">Looks unclear</span>':'')+'</td></tr>';}).join('')+'</tbody></table></div></section>';
}
B.on({
  gap:function(el){B.runGap(el.dataset.id);},
  applyGap:function(el){
    var id=el.dataset.id,gtxt=U.gap[id];if(!gtxt)return;
    var tgt=S.rules.guidelines.find(function(x){return x.id===id;})||S.rules.terms.find(function(x){return x.id===id;})||S.rules.claims.find(function(x){return x.id===id;});
    if(tgt){tgt.text=gtxt;delete U.gap[id];S.events=S.events.filter(function(e){return e.ruleId!==id||!e.sample;});B.saveState();B.render();B.toast('Rule '+id+' updated. Its sample dispute history was cleared.');}
  }
});
B.page({render:render});
B.boot();
})();
