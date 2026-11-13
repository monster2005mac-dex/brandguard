/* Tests for the Gemini relevance verifier. Run: node tests/ai.test.js */
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const storage=new Map();
const prompts=[];
const ctx={
  window:{BG_CONFIG:{},BG:{store:{mode:'local'}}},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  fetch:async(url,options)=>{
    const body=JSON.parse(options.body),prompt=body.contents[0].parts[0].text;
    prompts.push(prompt);
    let response;
    if(prompt.includes('independent brand-rule verifier')){
      response=JSON.stringify([{index:0,supported:true,confidence:0.9},{index:1,supported:false,confidence:0.95}]);
    }else{
      const section=Number((prompt.match(/This is section (\d+) of/)||[])[1]||1);
      response=JSON.stringify({company:'Acme',guidelines:[{title:'Section '+section,text:'Explicit rule '+section}],
        terms:[{avoid:'client',good:'customer'}],facts:[],claims:[]});
    }
    return {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:response}]}}]})};
  }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/ai.js'),'utf8'),ctx);
const AI=ctx.window.BG.ai;

(async()=>{
  await AI.setLocalKey('test-key');
  const result=await AI.verifyCandidates([
    {ruleId:'G-02',quote:'guarantee results',issue:'The rule prohibits guarantees.',confidence:0.8},
    {ruleId:'G-04',quote:'visit our page',issue:'The rule prohibits guarantees.',confidence:0.9}
  ],[{id:'G-02',text:'Do not promise guaranteed outcomes.'},{id:'G-04',text:'Use meaningful link text.'}]);
  assert.strictEqual(result.length,2);
  assert.strictEqual(result[0].supported,true);
  assert.strictEqual(result[0].confidence,0.77);
  assert.strictEqual(result[1].supported,false);
  const before=prompts.length;
  const extracted=await AI.extractRules('rule '.repeat(10000));
  assert.strictEqual(extracted.meta.chunks,2);
  assert.strictEqual(extracted.meta.processedChars,50000);
  assert.strictEqual(extracted.guidelines.length,2);
  assert.strictEqual(extracted.terms.length,1,'repeated items across sections are de-duplicated');
  assert.strictEqual(prompts.length-before,2,'each guideline section is analyzed');
  const limited=await AI.extractRules('rule '.repeat(40000));
  assert.strictEqual(limited.meta.chunks,8);
  assert.strictEqual(limited.meta.incomplete,true);
  assert(limited.meta.processedChars<limited.meta.totalChars);
  assert.strictEqual(prompts.length-before-2,8,'large guide is explicitly bounded to eight analyzed sections');
  const awkward=await AI.extractRules('Acme Bank brand guide. '.repeat(10000));
  assert.strictEqual(awkward.meta.chunks,8,'word-boundary splits do not exceed the eight-call limit');
  assert.strictEqual(awkward.meta.processedChars,192000);
  assert.strictEqual(prompts.length-before-10,8,'all sections of awkwardly spaced long input are analyzed');
  console.log('8 passed');
})().catch(error=>{console.error(error);process.exit(1);});
