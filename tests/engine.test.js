/* Node tests for the pure rule engine. Run: node tests/engine.test.js */
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const ctx={window:{},console};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/engine.js'),'utf8'),ctx);
const E=ctx.window.BG.engine;let n=0;
function t(name,fn){fn();n++;console.log('ok  '+name);}
const R=E.seedRules();
const ids=(txt,rules)=>E.runRules(txt,rules||R).map(f=>f.ruleId);

t('flags guarantee/100%',()=>assert(ids('We guarantee 100% results.').includes('G-02')));
t('flags student term',()=>assert(ids('Students love it.').includes('T-01')));
t('wrong fact flagged, right fact not',()=>{assert(ids('We have 52,000 learners.').includes('F-01'));assert(!ids('We have 48,000 learners.').includes('F-01'));});
t('ranking claim needs evidence; evidence clears it',()=>{assert(ids("India's #1 platform").includes('C-01'));const r=E.seedRules();r.claims[0].evidence='Survey';assert(!ids("India's #1 platform",r).includes('C-01'));});
t('img without alt flagged',()=>assert(ids('<img src="a.jpg">').includes('G-04')));
t('img with alt not flagged',()=>assert(!ids('<img src="a.jpg" alt="team">').includes('G-04')));
t('clean text has no findings',()=>assert.strictEqual(ids('Our learners use an affordable monthly plan.').length,0));
t('template pack has generic checks and no invented facts',()=>{const T=E.templateRules('Acme');assert.strictEqual(T.company,'Acme');assert.strictEqual(T.facts.length,0);assert.strictEqual(T.terms.length,0);assert(!JSON.stringify(T).includes('Northwind'));assert(ids('We guarantee results!!',T).includes('G-02'));});
t('link suggestion uses the workspace brand, not Northwind',()=>{const T=E.templateRules('Acme Corp');const f=E.runRules('Click here now',T).find(x=>x.ruleId==='G-04');assert(f&&f.suggestion==='Visit Acme Corp');});
t('fact pattern from imported rule works',()=>{const T=E.templateRules('Acme');T.facts.push({id:'F-01',subject:'Customers',value:'48000',display:'48000 customers',pattern:'(\\d[\\d,]*)\\+?\\s+customers',owner:'x',expires:E.isoPlus(100)});assert(ids('Over 50,000 customers trust us',T).includes('F-01'));assert(!ids('Over 48,000 customers trust us',T).includes('F-01'));});
t('score drops with open high findings',()=>assert.strictEqual(E.score([{status:'open',severity:'high'}]),90));
t('reliability harness is 100% on bundled cases',()=>{const r=E.reliability();assert.strictEqual(r.accuracy,1);});
console.log(n+' passed');
