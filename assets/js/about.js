/* About page: how each role uses the product, the architecture, responsible-AI notes, stack and roadmap. */
(function(){
'use strict';
var BG=window.BG,sh=BG.shell;
function render(){
  document.getElementById('page').innerHTML='<div class="stack" style="max-width:1000px">'+
  '<section class="panel"><span class="eyebrow">Getting started</span><h2 style="font-size:24px;margin:6px 0 12px">How each role uses BrandGuard</h2><ol class="stack" style="margin:0;padding-left:20px;gap:8px">'+
    '<li><b>Admin: set the rules.</b> Open <i>Brand rules</i>, import your guidelines document or add terminology, approved facts with an owner and expiry date, and claims that need evidence. Set the brand palette and the minimum contrast.</li>'+
    '<li><b>Creator: write and check.</b> Paste or import a draft in <i>Review</i>. Every finding cites a rule ID and the exact text. Accept a fix, write your own wording, or dispute it with a reason.</li>'+
    '<li><b>Creator: add the visual.</b> Attach one PNG or JPG, describe it in the alt text, and mark any text on it so the contrast can be checked.</li>'+
    '<li><b>Creator: submit.</b> High-severity findings must be fixed or disputed first. The exact version goes to the <i>Workshop</i> for review.</li>'+
    '<li><b>Reviewer: decide.</b> Open the item in the <i>Workshop</i>, read the findings, comments and version history, then approve or request changes. Nobody can approve a document they created.</li>'+
    '<li><b>Everyone: learn.</b> <i>Insights</i> shows which rules creators keep disputing. Those are guideline gaps: the rule is the problem, not the content.</li></ol></section>'+
  '<section class="panel"><span class="eyebrow">Architecture</span><h2 style="font-size:24px;margin:6px 0 14px">Retrieve, judge, verify</h2>'+
    '<div class="arch"><div class="node"><b>1. Draft</b>Creator pastes content</div><div class="node core"><b>2. Exact rules</b>Terms, facts, claims, accessibility, tone. Runs in the browser.</div><div class="node core"><b>3. Gemini (optional)</b>Judges tone and meaning against only the listed rules</div><div class="node core"><b>4. Verifier</b>Drops any finding with no real rule ID or quote not in the draft</div><div class="node"><b>5. Person decides</b>Accept, edit or dispute. Reviewer approves.</div></div>'+
    '<p class="muted" style="margin-top:14px">Reliability comes from the verifier, not the model. A flag survives only if it cites an existing rule and quotes text that is really in the draft. The screen shows how many AI findings were dropped.</p></section>'+
  '<div class="grid2" style="margin-top:0"><section class="panel"><h2 style="margin-bottom:10px">Responsible AI</h2><ul class="stack" style="margin:0;padding-left:18px;gap:8px">'+
    '<li>AI proposes. It never edits, publishes or approves.</li><li>Every finding shows why, the source rule and a confidence label.</li><li>Only the draft and the rule list are sent to Gemini, and only when a person clicks the deep check.</li><li>Roles limit who can approve. Creators cannot approve their own work.</li><li>An audit trail records every version, comment and decision.</li></ul></section>'+
  '<section class="panel"><h2 style="margin-bottom:10px">Stack</h2><ul class="stack" style="margin:0;padding-left:18px;gap:8px">'+
    '<li><b>Front end:</b> multi-page HTML, CSS and vanilla JavaScript. No build step.</li><li><b>Auth and data:</b> Firebase Authentication and Cloud Firestore, with security rules by role.</li><li><b>AI:</b> Google Gemini through a server-side endpoint, so the API key never reaches the browser.</li><li><b>Approval:</b> a server endpoint re-verifies the exact version, brand rules and image before it records an approval.</li></ul></section></div>'+
  '<section class="panel"><span class="eyebrow">Roadmap</span><h2 style="font-size:22px;margin:6px 0 10px">Planned next</h2><ul class="stack" style="margin:0;padding-left:18px;gap:6px"><li>Text detection in images, so the contrast check no longer relies on a color pair you select.</li><li>Logo version and layout safe-zone checks.</li><li>CMS and Slack or Teams integrations for review requests.</li><li>Per-organisation workspaces with single sign-on.</li><li>Multilingual tone and terminology rules.</li></ul></section>'+
  '</div>';
}
sh.start({page:'about',title:'About BrandGuard',sub:'How it works, why it can be trusted, and where it goes next.',onReady:render});
})();
