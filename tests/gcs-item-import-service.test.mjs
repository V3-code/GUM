import test from 'node:test';
import assert from 'node:assert/strict';
import {planGCSItemImport} from '../module/utils/gcs-item-import-plan.mjs';
import {GCSItemImportService} from '../module/services/gcs-item-import-service.mjs';
const plan=()=>planGCSItemImport([{name:'test.adq',text:JSON.stringify({version:5,rows:[{id:'t123',name:'One',base_points:1},{id:'t124',name:'Two',base_points:2}]})}]);
function harness(){const items=[],folders=[];return {items,folders,isGM:()=>true,listItems:async()=>items,createFolder:async name=>{folders.push(name);return 'folder';},createItem:async data=>{const item={...structuredClone(data),id:String(items.length)};items.push(item);return item;}};}
test('cancel has zero writes and repeated import skips even edited existing items',async()=>{
 const p=harness(),s=new GCSItemImportService(p),data=await plan();
 await s.execute(data,{confirmed:false});assert.equal(p.folders.length,0);
 const first=await s.execute(data,{confirmed:true});assert.equal(first.created,2);
 p.items[0].name='Edited';const second=await s.execute(data,{confirmed:true});assert.equal(second.skipped,2);assert.equal(p.items.length,2);
});
test('permission is checked before writing and lost response reconciles',async()=>{
 const p=harness(),s=new GCSItemImportService(p),data=await plan();p.isGM=()=>false;
 await assert.rejects(s.execute(data,{confirmed:true}),/Mestre/);assert.equal(p.items.length,0);
 p.isGM=()=>true;const create=p.createItem;p.createItem=async d=>{await create(d);throw Error('lost response');};
 const result=await s.execute(data,{confirmed:true});assert.equal(result.created,2);assert.equal(result.failed,0);
 assert.equal((await s.execute(data,{confirmed:true})).skipped,2);
});
test('changed source creates a variant without overwriting, identical source in batch skips',async()=>{
 const p=harness(),s=new GCSItemImportService(p),data=await plan();await s.execute(data,{confirmed:true});
 const changed=await planGCSItemImport([{name:'test.adq',text:JSON.stringify({version:5,rows:[{id:'t123',name:'One',base_points:3}]})}]);
 const result=await s.execute(changed,{confirmed:true});assert.equal(result.created,1);assert.equal(p.items[0].system.points,1);assert.match(result.files[0].warnings.at(-1),/variante/);
 assert.equal((await s.execute({files:[...changed.files,...changed.files]},{confirmed:true})).skipped,2);
});
test('partial write failure is visible and retry creates only missing item',async()=>{
 const p=harness(),s=new GCSItemImportService(p),data=await plan(),create=p.createItem;
 p.createItem=async d=>{if(d.name==='Two')throw Error('failure');return create(d);};
 const result=await s.execute(data,{confirmed:true});assert.equal(result.created,1);assert.equal(result.failed,1);
 p.createItem=create;const retry=await s.execute(data,{confirmed:true});assert.equal(retry.skipped,1);assert.equal(retry.created,1);
});
test('uncertain result with failed read stops rather than duplicating later entries',async()=>{
 const p=harness(),s=new GCSItemImportService(p),data=await plan(),create=p.createItem;let reads=0;
 p.listItems=async()=>{if(reads++)throw Error('offline');return p.items;};
 p.createItem=async d=>{await create(d);throw Error('lost');};
 const result=await s.execute(data,{confirmed:true});assert.equal(result.interrupted,true);assert.equal(p.items.length,1);
});
test('untrusted plan cannot choose Actor or ownership, and concurrent import is rejected',async()=>{
 const p=harness(),s=new GCSItemImportService(p),data=await plan();data.files[0].drafts[0].ownership={default:3};
 const rejected=await s.execute(data,{confirmed:true});assert.equal(rejected.invalid,1);assert.match(rejected.files[0].errors[0],/não permitido/);assert.equal(p.folders.length,0);
 const clean=await plan();let release;p.listItems=()=>new Promise(r=>release=r);
 const running=s.execute(clean,{confirmed:true});await assert.rejects(new GCSItemImportService(harness()).execute(clean,{confirmed:true}),/andamento/);
 release([]);await running;
});
test('expanded nested templates accepted in preview can be persisted using the same limits',async()=>{
 let node={name:'Trait',base_points:1};for(let i=0;i<6;i++)node={name:`Group ${i}`,children:[node]};
 const data=await planGCSItemImport([{name:'nested.gct',text:JSON.stringify({version:5,traits:[node]})}]);
 assert.equal(data.files[0].error,undefined);
 const p=harness();const result=await new GCSItemImportService(p).execute(data,{confirmed:true});
 assert.equal(result.created,1);assert.equal(result.invalid,0);
});
test('invalid later file preserves report of earlier writes and does not abort valid later files',async()=>{
 const data=await plan();const bad=structuredClone(data.files[0]);bad.name='bad.adq';bad.drafts[0].type='Actor';
 const result=await new GCSItemImportService(harness()).execute({files:[data.files[0],bad,data.files[0]]},{confirmed:true});
 assert.equal(result.created,2);assert.equal(result.invalid,1);assert.equal(result.skipped,2);assert.equal(result.files.length,3);
});
