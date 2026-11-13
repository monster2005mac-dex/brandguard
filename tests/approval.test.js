/* Server approval checks. Run: node tests/approval.test.js */
const assert=require('assert'),crypto=require('crypto'),Module=require('module'),sharp=require('sharp');
const E=require('../assets/js/engine.js');
let fixture={};
const app={};
const workspaceId='ws-acme';
const refs={
  'docs/test-doc':{collection:'docs',id:'test-doc'},
  ['brandRules/'+workspaceId]:{collection:'brandRules',id:workspaceId},
  'users/reviewer':{collection:'users',id:'reviewer'}
};
const fakeDb={
  collection(name){return {doc(id){return refs[name+'/'+id]||{collection:name,id:id};}};},
  async runTransaction(work){
    const tx={
      async get(ref){const value=fixture[ref.collection+'/'+ref.id];return {exists:!!value,data:()=>value};},
      update(ref,value){fixture[ref.collection+'/'+ref.id]=Object.assign({},fixture[ref.collection+'/'+ref.id],value);}
    };
    return work(tx);
  }
};
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
  if(request==='firebase-admin/app')return {getApps:()=>[app],initializeApp:()=>app,cert:x=>x};
  if(request==='firebase-admin/auth')return {getAuth:()=>({verifyIdToken:async()=>({uid:'reviewer'})})};
  if(request==='firebase-admin/firestore')return {getFirestore:()=>fakeDb};
  return originalLoad.call(this,request,parent,isMain);
};
process.env.FIREBASE_SERVICE_ACCOUNT_JSON='{}';
const handler=require('../api/approve.js');

function makeFixture(text,visual){
  const rules=E.templateRules('Acme');
  const summary={rulesFingerprint:E.fingerprint(rules),checkSnapshot:E.checkSnapshot(text,rules),visualSnapshot:E.visualSnapshot(visual),disputedList:[]};
  fixture={
    'docs/test-doc':{owner:'creator',workspaceId,status:'In review',versions:[{n:1,text,summary}],audit:[],image:visual?{dataUrl:visual.dataUrl,name:'creative.jpg'}:null,visual:visual?E.visualSnapshot(visual):null},
    ['brandRules/'+workspaceId]:rules,
    'users/reviewer':{role:'Reviewer',workspaceId,name:'Reviewer'}
  };
}
async function request(body){
  const res={statusCode:0,body:null,setHeader(){},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
  await handler({method:'POST',headers:{authorization:'Bearer test-token'},body:Object.assign({docId:'test-doc',version:1},body)},res);
  return res;
}

(async()=>{
  const pixel=await sharp({create:{width:96,height:96,channels:3,background:'#0D4033'}}).jpeg({quality:100}).toBuffer();
  const dataUrl='data:image/jpeg;base64,'+pixel.toString('base64'),colors=await handler.dominantColors(dataUrl);
  assert(colors.length>0&&E.colorDistance(colors[0],'#0D4033')<12,'server image sampling should preserve the dominant color');
  await assert.rejects(handler.dominantColors('x'.repeat(220001)),error=>error.code==='invalid_image');
  const oversized=await sharp({create:{width:1281,height:1,channels:3,background:'#0D4033'}}).jpeg().toBuffer();
  await assert.rejects(handler.dominantColors('data:image/jpeg;base64,'+oversized.toString('base64')),error=>error.code==='invalid_image');

  makeFixture('Our learners have flexible access.');
  const approved=await request({});
  assert.strictEqual(approved.statusCode,200);
  assert.strictEqual(fixture['docs/test-doc'].status,'Approved');
  assert.strictEqual(fixture['docs/test-doc'].approval.version,1);
  assert.match(fixture['docs/test-doc'].approval.versionHash,/^[a-f0-9]{64}$/);

  makeFixture('We guarantee results.');
  const blocked=await request({});
  assert.strictEqual(blocked.statusCode,409);
  assert.strictEqual(blocked.body.code,'blocking_findings');

  makeFixture('We guarantee results.');
  const blocker=E.runRules('We guarantee results.',fixture['brandRules/'+workspaceId]).find((finding)=>finding.severity==='high');
  fixture['docs/test-doc'].versions[0].summary.disputedList=[{ruleId:blocker.ruleId,quote:blocker.quote,reason:' '}];
  const reasonRequired=await request({});
  assert.strictEqual(reasonRequired.statusCode,409);
  assert.strictEqual(reasonRequired.body.code,'blocking_findings');

  makeFixture('We guarantee results.');
  const validBlocker=E.runRules('We guarantee results.',fixture['brandRules/'+workspaceId]).find((finding)=>finding.severity==='high');
  fixture['docs/test-doc'].versions[0].summary.disputedList=[{ruleId:validBlocker.ruleId,quote:validBlocker.quote,reason:'This claim is backed by the signed service terms.'}];
  const disputed=await request({});
  assert.strictEqual(disputed.statusCode,200);

  makeFixture('Our learners have flexible access.');
  fixture['brandRules/'+workspaceId].company='Changed brand';
  const staleRules=await request({});
  assert.strictEqual(staleRules.statusCode,409);
  assert.strictEqual(staleRules.body.code,'stale_rules');

  makeFixture('Our learners have flexible access.');
  fixture['brandRules/'+workspaceId].unexpected='<script>';
  const invalidPack=await request({});
  assert.strictEqual(invalidPack.statusCode,409);
  assert.strictEqual(invalidPack.body.code,'invalid_brand_pack');

  makeFixture('Our learners have flexible access.');
  fixture['docs/test-doc'].owner='reviewer';
  const selfApproval=await request({});
  assert.strictEqual(selfApproval.statusCode,403);
  assert.strictEqual(selfApproval.body.code,'self_approval');

  makeFixture('Our learners have flexible access.');
  fixture['users/reviewer'].role='Creator';
  const creatorApproval=await request({});
  assert.strictEqual(creatorApproval.statusCode,403);
  assert.strictEqual(creatorApproval.body.code,'forbidden');

  const visual={colors,alt:'Dark green brand background',hasText:false,foreground:'#FFFFFF',background:'#0D4033',
    imageHash:crypto.createHash('sha256').update(dataUrl).digest('hex'),dataUrl};
  makeFixture('Our learners have flexible access.',visual);
  const unconfirmed=await request({});
  assert.strictEqual(unconfirmed.statusCode,400);
  assert.strictEqual(unconfirmed.body.code,'visual_confirmation_required');
  const imageApproved=await request({visualConfirmed:true});
  assert.strictEqual(imageApproved.statusCode,200);
  assert.strictEqual(fixture['docs/test-doc'].approval.visualConfirmed,true);

  console.log('7 passed');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Module._load=originalLoad;});
