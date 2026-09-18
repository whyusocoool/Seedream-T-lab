import assert from 'node:assert/strict';
import { build } from 'esbuild';
const output=await build({entryPoints:['src/data/recoverWorkspace.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'repo',setup(b){b.onResolve({filter:/^\.\/cloudRepository$/},()=>({path:'repo',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export const cloudRepository={};'}));}}]});
const {recoverWorkspace}=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
const report={templateName:'Original report',seedreamPrompt:'Original prompt',usageScenario:'Original scenario'};
const scan={workspaceId:'workspace-a',job:'ux',errors:[null,null],documents:[{workspace_id:'workspace-a',document_type:'rules',document_key:'definition-tpl-1789438681217',updated_at:'2026-09-15T00:00:00Z',payload:report},{workspace_id:'other',document_type:'rules',document_key:'definition-tpl-1789438681218',payload:report}],images:[{id:'asset-a',name:'original.png',created_at:'2026-09-15'}]};
let catalog=[{id:'existing-template'}];
let canvas={payload:{items:[{id:'existing-image',assetPath:'workspace-a/ux/existing.png'}],groups:{preserved:true}}};
let writes=0;
const repo={
 searchColleagues:async(_workspace,term)=>term==='Hanyi'?[]:[{id:term,name:'Lico',jobs:['tester']}],
 currentProfile:async()=>({id:'Hanyi',name:'Hanyi Wang',jobs:['ux']}),
 loadSharedDocument:async()=>catalog,
 saveSharedDocument:async(_workspace,_type,_key,value)=>{catalog=value;writes++;},
 loadCanvas:async()=>canvas,
 imageUrl:async path=>`signed:${path}`,
 saveCanvas:async(_workspace,job,value)=>{assert.equal(job,'ux');canvas={payload:value};writes++;},
};
assert.deepEqual(await recoverWorkspace(scan,repo),{templates:1,images:1});
assert.equal(catalog[0].id,'existing-template');
assert.equal(catalog[1].id,'tpl-1789438681217');
assert.equal(catalog[1].aiDefinition,report);
assert.equal(catalog[1].ownerId,'Hanyi');
assert.deepEqual(catalog[1].collaborators,['Lico']);
assert.equal(catalog[1].referenceImagePaths,undefined,'Do not invent lost reference associations');
assert.equal(canvas.payload.items[0].id,'existing-image');
assert.deepEqual(canvas.payload.groups,{preserved:true});
assert.equal(canvas.payload.items[1].assetPath,'workspace-a/ux/original.png');
assert.deepEqual(await recoverWorkspace(scan,repo),{templates:0,images:0});
assert.equal(writes,2,'Retries must not duplicate or rewrite existing records');
await assert.rejects(recoverWorkspace({...scan,job:'tester'},repo),/UX/);
await assert.rejects(recoverWorkspace({...scan,errors:['denied']},repo),/UX/);
await assert.rejects(recoverWorkspace(scan,{...repo,searchColleagues:async()=>[]}),/无法唯一/);
console.log('PASS surviving-report recovery, original IDs/owners, scope isolation, existing data preservation, idempotency, no guessed associations');
