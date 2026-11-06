/* About page: a two-minute guide for judges, the architecture, responsible-AI notes, stack and roadmap. */
(function(){
'use strict';
var BG=window.BG,sh=BG.shell;
function render(){
  document.getElementById('page').innerHTML='<div class="stack" style="max-width:1000px">'+
  '<section class="panel"><span class="eyebrow">For judges</span><h2 style="font-size:24px;margin:6px 0 12px">A two-minute tour</h2><ol class="stack" style="margin:0;padding-left:20px;gap:8px">'+
    '<li><b>Review.</b> A draft with 13 mistakes is already loaded. Click <i>Accept fix</i> on a few. Open one and read the <i>Source</i> line: every flag cites a rule ID.</li>'+
    '<li><b>Write the hard ones.</b> Use <i>Write it</i> on the image (alt text) and the link. A tool cannot know what a photo shows, so it asks a person.</li>'+
    '<li><b>Dispute.</b> Dispute the expired price with a reason. High-severity items must be fixed or disputed before you can submit.</li>'+
    '<li><b>Submit, then switch role.</b> In the sidebar choose <i>Reviewer</i>, open the item on the Workflow board, and approve or request changes. A Creator cannot approve.</li>'+
    '<li><b>Brand rules.</b> As <i>Admin</i>, add evidence to claim C-01 and the matching flag disappears. Facts F-02 and F-03 show expiry.</li>'+
    '<li><b>Import and export.</b> Import text, DOCX or PDF content, then export the brand pack and a reviewer-ready report.</li>'+
    '<li><b>Insights.</b> See which rules creators keep disputing. Those are guideline gaps: the rule is the problem, not the content.</li></ol></section>'+
  '<section class="panel"><span class="eyebrow">Architecture</span><h2 style="font-size:24px;margin:6px 0 14px">Retrieve, judge, verify</h2>'+
    '<div class="arch"><div class="node"><b>1. Draft</b>Creator pastes content</div><div class="node core"><b>2. Exact rules</b>Terms, facts, claims, accessibility, tone. Runs in the browser.</div><div class="node core"><b>3. Gemini (optional)</b>Judges tone and meaning against only the listed rules</div><div class="node core"><b>4. Verifier</b>Drops any finding with no real rule ID or quote not in the draft</div><div class="node"><b>5. Person decides</b>Accept, edit or dispute. Reviewer approves.</div></div>'+
    '<p class="muted" style="margin-top:14px">Reliability comes from the verifier, not the model. A flag survives only if it cites an existing rule and quotes text that is really in the draft. The screen shows how many AI findings were dropped.</p></section>'+
  '<div class="grid2" style="margin-top:0"><section class="panel"><h2 style="margin-bottom:10px">Responsible AI</h2><ul class="stack" style="margin:0;padding-left:18px;gap:8px">'+
    '<li>AI proposes. It never edits, publishes or approves.</li><li>Every finding shows why, the source rule and a confidence label.</li><li>Only the draft and the rule list are sent to Gemini, and only when a person clicks the deep check.</li><li>Roles limit who can approve. Creators cannot approve their own work.</li><li>An audit trail records every version, comment and decision.</li></ul></section>'+
  '<section class="panel"><h2 style="margin-bottom:10px">Stack</h2><ul class="stack" style="margin:0;padding-left:18px;gap:8px">'+
    '<li><b>Front end:</b> multi-page HTML, CSS and vanilla JavaScript. No build step.</li><li><b>Auth and data:</b> Firebase Authentication and Cloud Firestore, with security rules by role.</li><li><b>AI:</b> Google Gemini 2.5 Flash, configured by an Admin.</li><li><b>Local demo mode:</b> the same app on browser storage when no Firebase keys are set.</li></ul></section></div>'+
  '<section class="panel"><span class="eyebrow">Roadmap</span><h2 style="font-size:22px;margin:6px 0 10px">After the hackathon</h2><ul class="stack" style="margin:0;padding-left:18px;gap:6px"><li>Document and PDF import, then slide decks.</li><li>Image checks: logo version, palette, safe zones.</li><li>CMS and Slack or Teams integrations for review requests.</li><li>Per-organisation workspaces with SSO and roles set by admins.</li><li>Multilingual tone and terminology rules.</li></ul></section>'+
  '</div>';
}
sh.start({page:'about',title:'About BrandGuard',sub:'How it works, why it can be trusted, and where it goes next.',onReady:render});
})();
