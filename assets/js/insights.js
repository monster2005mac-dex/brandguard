/* Insights page: recurring mistakes, activity trend, facts that need an owner, and guideline gaps (rules creators keep disputing). */
(function(){
'use strict';
var BG=window.BG,E=BG.engine,esc=E.esc,S=BG.store,UI=BG.ui,sh=BG.shell;
var $=function(id){return document.getElementById(id);};
var gap={},busy=null;

function dayKey(d){return d.toISOString().slice(0,10);}
function trendSvg(ev){
  var days=[],i;
  for(i=13;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);days.push(dayKey(d));}
  var counts=days.map(function(k){return ev.filter(function(e){return String(e.at).slice(0,10)===k;}).length;});
  var disp=days.map(function(k){return ev.filter(function(e){return String(e.at).slice(0,10)===k&&e.outcome==='disputed';}).length;});
  var max=Math.max.apply(null,counts.concat([3])),W=620,H=190,L=34,R=10,T=14,B=28,iw=W-L-R,ih=H-T-B;
  var x=function(k){return L+iw*k/(days.length-1);},y=function(v){return T+ih-ih*v/max;};
  var path=function(arr){return arr.map(function(v,k){return (k?'L':'M')+x(k).toFixed(1)+' '+y(v).toFixed(1);}).join(' ');};
  var grid='',g;
  for(g=0;g<=max;g+=Math.max(1,Math.ceil(max/4))){grid+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(g).toFixed(1)+'" y2="'+y(g).toFixed(1)+'" style="stroke:var(--line)"/><text x="'+(L-8)+'" y="'+(y(g)+4).toFixed(1)+'" text-anchor="end">'+g+'</text>';}
  var lab=[0,6,13].map(function(k){return '<text x="'+x(k).toFixed(1)+'" y="'+(H-8)+'" text-anchor="'+(k===0?'start':k===13?'end':'middle')+'">'+days[k].slice(5)+'</text>';}).join('');
  return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Findings resolved per day over the last 14 days">'+grid+lab+
    '<path d="'+path(counts)+' L'+x(13).toFixed(1)+' '+y(0).toFixed(1)+' L'+x(0).toFixed(1)+' '+y(0).toFixed(1)+'Z" style="fill:var(--brand);fill-opacity:.12"/>'+
    '<path d="'+path(counts)+'" fill="none" style="stroke:var(--brand);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round"/>'+
    '<path d="'+path(disp)+'" fill="none" style="stroke:var(--med);stroke-width:2;stroke-dasharray:4 4;stroke-linecap:round"/>'+
    '<circle cx="'+x(13).toFixed(1)+'" cy="'+y(counts[13]).toFixed(1)+'" r="4" style="fill:var(--brand)"/></svg>';
}
function render(){
  var ev=S.events,rows=E.insightRows(ev),y=window.scrollY,c=sh.can();
  var tot=ev.length,disp=ev.filter(function(e){return e.outcome==='disputed';}).length;
  var cats={};ev.forEach(function(e){cats[e.category]=(cats[e.category]||0)+1;});
  var catRows=Object.keys(cats).sort(function(a,b){return cats[b]-cats[a];}),max=Math.max.apply(null,catRows.map(function(k){return cats[k];}).concat([1]));
  var stale=S.rules.facts.filter(function(f){return E.factStatus(f)!=='current';});
  var gaps=rows.filter(function(r){return r.gap;});
  var catalog=E.allRules(S.rules);
  $('page').innerHTML='<div class="stack">'+
   '<div class="note">Built from every Accept, Edit and Dispute.</div>'+
   '<div class="kpis"><div class="kpi"><b>'+tot+'</b><span>findings resolved</span></div><div class="kpi"><b>'+(tot?Math.round((tot-disp)/tot*100):0)+'%</b><span>fixed by the creator</span></div><div class="kpi"><b>'+(tot?Math.round(disp/tot*100):0)+'%</b><span>disputed</span></div><div class="kpi"><b>'+stale.length+'</b><span>facts expired or expiring</span></div></div>'+
   '<div class="grid2" style="margin-top:0"><section class="panel chart"><h2 style="margin-bottom:4px">Activity, last 14 days</h2><p class="small muted" style="margin-bottom:8px">Findings resolved per day. The dashed line shows disputes.</p>'+trendSvg(ev)+'</section>'+
   '<section class="panel"><h2 style="margin-bottom:12px">Recurring mistakes by category</h2><div class="bars">'+
     (catRows.length?catRows.map(function(k){return '<div class="bar-row"><span>'+esc(k)+'</span><div class="track"><div class="fill" style="width:'+Math.round(cats[k]/max*100)+'%"></div></div><span class="mono">'+cats[k]+'</span></div>';}).join(''):'<div class="empty">No history yet.</div>')+'</div></section></div>'+
   '<section class="panel"><h2>Guideline gaps</h2><p class="small muted" style="margin:2px 0 12px">A rule that creators often dispute is probably unclear. The fix is in the guideline, not the content.</p>'+
     (gaps.length?gaps.map(function(r){
        var rule=catalog.find(function(x){return x.id===r.ruleId;}),g=gap[r.ruleId];
        return '<div class="fcard medium"><div class="row" style="justify-content:space-between"><div class="row"><span class="chip">'+r.ruleId+'</span><b>Disputed '+Math.round(r.rate*100)+'% of the time</b><span class="small muted">('+r.disputed+' of '+r.total+')</span></div></div>'+
          '<p class="small" style="margin:8px 0">'+esc(rule?rule.text:'')+'</p><div class="sec">What creators said</div><ul style="margin:0 0 10px;padding-left:18px" class="small">'+r.reasons.slice(0,4).map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul>'+
          (g?'<div class="note"><div class="sec">Suggested clearer wording (Gemini)</div>'+esc(g)+'</div><div class="row" style="margin-top:10px">'+(c.admin?'<button class="btn primary sm" data-act="applyGap" data-id="'+r.ruleId+'">Use this wording</button>':'<span class="small muted">Switch to Admin to apply.</span>')+'</div>':
            (BG.ai.available?'<button class="btn sm" data-act="gap" data-id="'+r.ruleId+'"'+(busy===r.ruleId?' disabled':'')+'>'+(busy===r.ruleId?'Gemini is reading…':'Suggest clearer wording with Gemini')+'</button>':'<span class="small muted">Rewrite this rule with an example of what is and is not allowed.</span>'))+'</div>';}).join('<div style="height:12px"></div>'):'<div class="empty">No rule is disputed often enough to look unclear.</div>')+
   '</section>'+
   '<div class="grid2" style="margin-top:0"><section class="panel"><h2 style="margin-bottom:12px">Facts that need an owner</h2>'+
     (stale.length?'<ul class="stack" style="list-style:none;margin:0;padding:0;gap:10px">'+stale.map(function(f){var st=E.factStatus(f);return '<li><span class="chip">'+f.id+'</span> <b>'+esc(f.subject)+'</b> <span class="pill '+(st==='expired'?'high':'medium')+'">'+(st==='expired'?'Expired '+f.expires:'Expires '+f.expires)+'</span><div class="small muted">Owner: '+esc(f.owner)+'</div></li>';}).join('')+'</ul>':'<div class="empty">All facts are current.</div>')+'</section>'+
   '<section class="panel"><h2 style="margin-bottom:12px">All rules by activity</h2><div class="scroll"><table class="tbl"><thead><tr><th>Rule</th><th>Resolved</th><th>Fixed</th><th>Disputed</th></tr></thead><tbody>'+
     rows.map(function(r){return '<tr><td><span class="chip">'+r.ruleId+'</span> <span class="small muted">'+esc(r.category)+'</span></td><td>'+r.total+'</td><td>'+r.fixed+'</td><td>'+r.disputed+(r.gap?' <span class="pill medium">Looks unclear</span>':'')+'</td></tr>';}).join('')+'</tbody></table></div></section></div>'+
  '</div>';
  window.scrollTo(0,y);
}
document.addEventListener('click',function(ev){
  var el=ev.target.closest('[data-act]');if(!el)return;
  var a=el.dataset.act,id=el.dataset.id;
  if(a==='gap'){
    var r=E.insightRows(S.events).find(function(x){return x.ruleId===id;}),rule=E.allRules(S.rules).find(function(x){return x.id===id;});
    busy=id;render();
    BG.ai.text('A brand guideline is often disputed by content creators because it is unclear.\nRULE ('+id+'): '+rule.text+'\nCREATOR OBJECTIONS: '+JSON.stringify(r.reasons)+'\n\nRewrite the rule in at most 3 sentences so it is unambiguous. Say exactly what is allowed and what is not, with one short example of each. Reply with only the new rule text.')
      .then(function(t){gap[id]=String(t).trim();}).catch(function(e){UI.toast(BG.ai.errorCopy(e));}).then(function(){busy=null;render();});
    return;}
  if(a==='applyGap'){
    var txt=gap[id];if(!txt)return;var R=S.rules;
    var tgt=R.guidelines.find(function(x){return x.id===id;})||R.terms.find(function(x){return x.id===id;})||R.claims.find(function(x){return x.id===id;});
    if(tgt){tgt.text=txt;delete gap[id];S.removeSampleEvents(id);S.saveRules(R);UI.toast('Rule '+id+' updated.');}
  }
});
sh.start({page:'insights',title:'Insights',sub:'Where content goes wrong, and which guidelines are the real problem.',onReady:render,onData:render});
})();
