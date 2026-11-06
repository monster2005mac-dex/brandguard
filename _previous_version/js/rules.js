/* Brand rules page: the approved knowledge every finding cites. Admin can edit. */
(function(){
var B=BG,S=B.S,esc=B.esc,$=B.$;

function render(){
  var R=S.rules,c=B.can();
  var del=function(id){return c.admin?'<button class="btn sm danger" data-action="delRule" data-id="'+id+'" aria-label="Delete '+id+'">Delete</button>':'';};
  var sec=function(t,sub,body){return '<section class="panel"><h3>'+t+'</h3><p class="small muted" style="margin:3px 0 12px">'+sub+'</p><div class="scroll">'+body+'</div></section>';};
  return '<div class="page-head"><div><h1>Brand rules</h1><p>The approved knowledge base. Every finding cites one of these items by its ID. Company: '+esc(R.company)+'.</p></div>'+
      '<span class="pill '+(c.admin?'accent':'neutral')+'">'+(c.admin?'Editing as Admin':'Read only. Switch to Admin to edit')+'</span></div>'+
  '<div class="stack" style="gap:18px">'+
    sec('Guidelines','Written rules. "Rule check" rules run exactly. The others are used by the Claude deep check.',
      '<table class="tbl"><thead><tr><th>ID</th><th>Rule</th><th>How it is checked</th><th></th></tr></thead><tbody>'+R.guidelines.map(function(g){
        return '<tr><td><span class="chip">'+g.id+'</span></td><td><b>'+esc(g.title)+'</b><br><span class="muted">'+esc(g.text)+'</span></td><td>'+(g.check?'Rule check':'Claude deep check')+'</td><td>'+del(g.id)+'</td></tr>';}).join('')+'</tbody></table>'+
      (c.admin?'<details class="add"><summary>Add a guideline</summary><div class="stack" style="margin-top:10px"><div class="field"><label for="gTitle">Short title</label><input type="text" id="gTitle"></div><div class="field"><label for="gText">Rule text</label><textarea id="gText" rows="2"></textarea></div><div><button class="btn primary" data-action="addGuideline">Add guideline</button></div></div></details>':''))+
    sec('Terminology','Words to avoid and the approved replacement.',
      '<table class="tbl"><thead><tr><th>ID</th><th>Avoid</th><th>Use instead</th><th></th></tr></thead><tbody>'+R.terms.map(function(t){
        return '<tr><td><span class="chip">'+t.id+'</span></td><td>'+esc(t.avoid)+'</td><td>'+esc(t.good.replace('$1',''))+'</td><td>'+del(t.id)+'</td></tr>';}).join('')+'</tbody></table>'+
      (c.admin?'<details class="add"><summary>Add a term</summary><div class="row" style="margin-top:10px;align-items:end"><div class="field"><label for="tAvoid">Avoid</label><input type="text" id="tAvoid"></div><div class="field"><label for="tGood">Use instead</label><input type="text" id="tGood"></div><button class="btn primary" data-action="addTerm">Add term</button></div></details>':''))+
    sec('Approved facts','Each fact has an owner and an expiry date. Expired facts are flagged wherever they appear in a draft.',
      '<table class="tbl"><thead><tr><th>ID</th><th>Fact</th><th>Owner</th><th>Valid to</th><th></th></tr></thead><tbody>'+R.facts.map(function(f){
        var st=B.factStatus(f);
        return '<tr><td><span class="chip">'+f.id+'</span></td><td><b>'+esc(f.subject)+'</b><br><span class="muted">'+esc(f.display)+'</span></td><td>'+esc(f.owner)+'</td><td>'+esc(f.expires)+' <span class="pill '+(st==='expired'?'high':st==='soon'?'medium':'ok')+'">'+(st==='expired'?'Expired':st==='soon'?'Expires soon':'Current')+'</span></td><td>'+del(f.id)+'</td></tr>';}).join('')+'</tbody></table>'+
      (c.admin?'<details class="add"><summary>Add a fact</summary><div class="row" style="margin-top:10px;align-items:end"><div class="field"><label for="fSubject">Subject</label><input type="text" id="fSubject" placeholder="Instructor count"></div><div class="field"><label for="fValue">Number</label><input type="text" id="fValue" placeholder="300"></div><div class="field"><label for="fNoun">Word after the number</label><input type="text" id="fNoun" placeholder="instructors"></div><div class="field"><label for="fOwner">Owner</label><input type="text" id="fOwner"></div><div class="field"><label for="fExp">Valid to</label><input type="date" id="fExp"></div><button class="btn primary" data-action="addFact">Add fact</button></div></details>':''))+
    sec('Claims register','Risky claims. Without evidence on file, a matching claim is flagged and routed to a reviewer.',
      '<table class="tbl"><thead><tr><th>ID</th><th>Claim type</th><th>Evidence on file</th><th></th></tr></thead><tbody>'+R.claims.map(function(cl){
        return '<tr><td><span class="chip">'+cl.id+'</span></td><td><b>'+esc(cl.label)+'</b><br><span class="muted">'+esc(cl.text)+'</span></td><td>'+(cl.evidence?'<span class="pill ok">On file</span> '+esc(cl.evidence):'<span class="pill high">None</span>')+
        (c.admin?'<div class="row" style="margin-top:8px"><input type="text" id="ev-'+cl.id+'" placeholder="Evidence, e.g. Survey Q3 2026" style="flex:1 1 160px;width:auto"><button class="btn sm" data-action="setEvidence" data-id="'+cl.id+'">Save</button></div>':'')+'</td><td>'+del(cl.id)+'</td></tr>';}).join('')+'</tbody></table>'+
      (c.admin?'<details class="add"><summary>Add a claim type</summary><div class="row" style="margin-top:10px;align-items:end"><div class="field"><label for="cLabel">Label</label><input type="text" id="cLabel" placeholder="Award claim"></div><div class="field"><label for="cWords">Phrases to catch (comma separated)</label><input type="text" id="cWords" placeholder="award-winning, best in class"></div><button class="btn primary" data-action="addClaim">Add claim</button></div></details>':''))+
    (c.admin?'<div><button class="btn danger" data-action="reset">Reset all demo data</button></div>':'')+
  '</div>';
}
function done(){B.recompute();B.saveState();B.render();}
B.on({
  delRule:function(el){var R=S.rules,id=el.dataset.id;['guidelines','terms','facts','claims'].forEach(function(k){R[k]=R[k].filter(function(x){return x.id!==id;});});done();},
  addGuideline:function(){var gt=$('gTitle').value.trim(),gx=$('gText').value.trim();if(!gt||!gx)return;S.rules.guidelines.push({id:B.nextId('G',S.rules.guidelines),title:gt,text:gx,check:null,category:'Tone'});done();},
  addTerm:function(){var av=$('tAvoid').value.trim(),go=$('tGood').value.trim();if(!av||!go)return;S.rules.terms.push({id:B.nextId('T',S.rules.terms),avoid:av,pattern:B.escRe(av),good:go.replace(/\$/g,'$$$$'),text:'Say "'+go+'", not "'+av+'".'});done();},
  addFact:function(){
    var fs=$('fSubject').value.trim(),fv=$('fValue').value.trim(),fn=$('fNoun').value.trim(),fo=$('fOwner').value.trim(),fe=$('fExp').value;
    if(!fs||!fv||!fn||!fo||!fe)return;
    S.rules.facts.push({id:B.nextId('F',S.rules.facts),subject:fs,value:fv,display:fv+' '+fn,pattern:'(\\d[\\d,]*)\\+?\\s+'+B.escRe(fn),owner:fo,expires:fe});done();},
  addClaim:function(){
    var cl=$('cLabel').value.trim(),cw=$('cWords').value.split(',').map(function(x){return x.trim();}).filter(Boolean);
    if(!cl||!cw.length)return;
    S.rules.claims.push({id:B.nextId('C',S.rules.claims),label:cl,pattern:cw.map(B.escRe).join('|'),evidence:'',fix:'a well-regarded',text:cl+' claims need evidence on file and a reviewer sign-off.'});done();},
  setEvidence:function(el){var cc=S.rules.claims.find(function(x){return x.id===el.dataset.id;});if(cc){cc.evidence=($('ev-'+cc.id).value||'').trim();done();}},
  reset:function(){B.reset();B.render();}
});
B.page({render:render});
B.boot();
})();
