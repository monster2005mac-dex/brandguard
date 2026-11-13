/* Tests for the Gemini relevance verifier. Run: node tests/ai.test.js */
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const storage=new Map();
const ctx={
  window:{BG_CONFIG:{},BG:{store:{mode:'local'}}},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  fetch:async()=>({ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify([
    {index:0,supported:true,confidence:0.9},
    {index:1,supported:false,confidence:0.95}
  ])}]}}]})})
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
  console.log('2 passed');
})().catch(error=>{console.error(error);process.exit(1);});
