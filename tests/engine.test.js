/* Node tests for the pure rule engine. Run: node tests/engine.test.js */
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const ctx={window:{},console};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/engine.js'),'utf8'),ctx);
const E=ctx.window.BG.engine;let n=0;
function t(name,fn){fn();n++;console.log('ok  '+name);}
const R=E.seedRules();
const ids=(txt,rules)=>E.runRules(txt,rules||R).map(f=>f.ruleId);

t('Super Bowl is not slang, but standalone super is',()=>{assert(!ids('We watched the Super Bowl together.').includes('G-01'));assert(ids('This is super easy.').includes('G-01'));});
t('URLs inside HTML or markdown links are not bare URLs',()=>{assert(!ids('<a href="https://example.com/x">Our pricing page</a>').includes('G-04'));assert(!ids('See [pricing](https://example.com/x) now.').includes('G-04'));assert(ids('Go to https://example.com/x today.').includes('G-04'));});
t('100% remote is descriptive, 100% results is still flagged',()=>{assert(!ids('We are 100% remote.').includes('G-02'));assert(ids('Get 100% results.').includes('G-02'));});
t('flags guarantee/100%',()=>assert(ids('We guarantee 100% results.').includes('G-02')));
t('flags student term',()=>assert(ids('Students love it.').includes('T-01')));
t('wrong fact flagged, right fact not',()=>{assert(ids('We have 52,000 learners.').includes('F-01'));assert(!ids('We have 48,000 learners.').includes('F-01'));});
t('ranking claim needs evidence; evidence clears it',()=>{assert(ids("India's #1 platform").includes('C-01'));const r=E.seedRules();r.claims[0].evidence='Survey';assert(!ids("India's #1 platform",r).includes('C-01'));});
t('img without alt flagged',()=>assert(ids('<img src="a.jpg">').includes('G-04')));
t('img with alt not flagged',()=>assert(!ids('<img src="a.jpg" alt="team">').includes('G-04')));
t('clean text has no findings',()=>assert.strictEqual(ids('Our learners use an affordable monthly plan.').length,0));
t('template pack has generic checks and no invented facts',()=>{const T=E.templateRules('Acme');assert.strictEqual(T.company,'Acme');assert.strictEqual(T.facts.length,0);assert.strictEqual(T.terms.length,0);assert(!JSON.stringify(T).includes('Northwind'));assert(ids('We guarantee results!!',T).includes('G-02'));});
t('link suggestion uses the workspace brand, not Northwind',()=>{const T=E.templateRules('Acme Corp');const f=E.runRules('Click here now',T).find(x=>x.ruleId==='G-04');assert(f&&f.suggestion==='Visit Acme Corp');});
t('fact pattern from imported rule works',()=>{const T=E.templateRules('Acme');T.facts.push({id:'F-01',subject:'Customers',value:'48000',display:'48,000 customers',pattern:'(\\d[\\d,]*)\\+?\\s+customers',owner:'x',expires:E.isoPlus(100)});assert(ids('Over 50,000 customers trust us',T).includes('F-01'));assert(!ids('Over 40,000 customers trust us',T).includes('F-01'));assert(ids('Over 48,000 customers trust us',T).includes('F-01'));assert(!ids('At least 48,000 customers trust us',T).includes('F-01'));});
t('fact qualifiers and compact number formats respect the approved value',()=>{const T=E.templateRules('Acme');T.facts.push({id:'F-01',subject:'Learners',value:'48000',display:'48,000 learners',pattern:'(\\d[\\d,]*)\\+?\\s+learners',owner:'x',expires:E.isoPlus(100)});assert(!ids('Over 40k learners trust us.',T).includes('F-01'));assert(!ids('About 50k learners trust us.',T).includes('F-01'));assert(ids('Over 50k learners trust us.',T).includes('F-01'));assert(!ids('48,000+ learners trust us.',T).includes('F-01'));assert(!ids('Between 40,000 and 50,000 learners trust us.',T).includes('F-01'));});
t('lakh and decimal figures are normalized',()=>{const T=E.templateRules('Acme');T.facts.push({id:'F-01',subject:'Learners',value:'120000',display:'120,000 learners',owner:'x',expires:E.isoPlus(100)});assert(!ids('About 1.2 lakh learners trust us.',T).includes('F-01'));assert(ids('1.3 lakh learners trust us.',T).includes('F-01'));});
t('score drops with open high findings',()=>assert.strictEqual(E.score([{status:'open',severity:'high'}]),90));
t('high-severity findings never show ready status at a 90 score',()=>{const f=[{status:'open',severity:'high'}];assert.strictEqual(E.score(f),90);assert.strictEqual(E.readinessLabel(f),'Action required');});
t('accuracy benchmark contains 60 labelled samples and reports precision and recall',()=>{const r=E.accuracyReport(R);assert.strictEqual(r.tests,60);assert(r.positives>0);assert.strictEqual(r.precision,1);assert.strictEqual(r.recall,1);});
t('visual checks cite palette, contrast, and alt-text rule IDs',()=>{const T=E.templateRules('Acme');T.visual={palette:['#0D4033'],contrast:4.5,paletteTolerance:25};const f=E.visualChecks({colors:['#FF0000'],alt:'',hasText:true,foreground:'#FFFFFF',background:'#FFFFFF'},T);assert(f.some(x=>x.ruleId==='V-01'));assert(f.some(x=>x.ruleId==='V-02'&&x.severity==='high'));assert(f.some(x=>x.ruleId==='V-03'));});
t('visual palette and WCAG contrast pass on compliant inputs',()=>{const T=E.templateRules('Acme');T.visual={palette:['#000000'],contrast:4.5,paletteTolerance:25};assert.strictEqual(E.visualChecks({colors:['#000000'],alt:'A black square',hasText:true,foreground:'#FFFFFF',background:'#000000'},T).length,0);});
t('canonical JSON ignores object key insertion order',()=>assert.strictEqual(E.canonicalJson({b:2,a:1}),E.canonicalJson({a:1,b:2})));
t('brand-pack fingerprints are stable regardless of key order',()=>assert.strictEqual(E.fingerprint({b:2,a:1}),E.fingerprint({a:1,b:2})));
t('reliability harness is 100% on bundled cases',()=>{const r=E.reliability();assert.strictEqual(r.accuracy,1);});
t('a rule with an invalid pattern is skipped instead of crashing the review',()=>{
  const bad=JSON.parse(JSON.stringify(R));
  bad.terms.push({id:'T-99',avoid:'x',pattern:'(unclosed',good:'y',text:'bad'});
  bad.claims.push({id:'C-99',label:'Bad',pattern:'[a-',evidence:'',fix:'z',text:'bad'});
  assert.doesNotThrow(()=>E.runRules('We guarantee 100% results for students.',bad));
  assert(ids('We guarantee 100% results.',bad).includes('G-02'),'valid rules still run');
});
console.log(n+' passed');
