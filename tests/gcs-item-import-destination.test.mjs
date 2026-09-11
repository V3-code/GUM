import test from 'node:test';
import assert from 'node:assert/strict';
import {createGCSImportDestination} from '../module/services/gcs-item-import-destination.mjs';
import {GCSItemImportService} from '../module/services/gcs-item-import-service.mjs';
import {planGCSItemImport} from '../module/utils/gcs-item-import-plan.mjs';
async function plan(){return planGCSItemImport([{name:'x.adq',text:JSON.stringify({version:5,rows:[{name:'One',base_points:1},{name:'Two',base_points:2}]})}]);}
function env(){
 const world=[],packed=[],calls=[];let permitted=true;
 const pack={collection:'world.custom',title:'Custom',documentName:'Item',locked:false,testUserPermission:()=>permitted,documentClass:{canUserCreate:()=>true},getDocuments:async()=>packed};
 const game={user:{isGM:true},items:{contents:world},packs:new Map([[pack.collection,pack]])};
 const Item={canUserCreate:()=>true,create:async(data,options)=>{calls.push(options);const item={...structuredClone(data),id:String(calls.length)};(options.pack?packed:world).push(item);return item;}};
 return {game,Item,pack,world,packed,calls,revoke:()=>{permitted=false;}};
}
test('pack import reads full documents and creates directly in fixed destination, world stays empty',async()=>{
 const e=env(),dest=createGCSImportDestination({packId:e.pack.collection},e);
 assert.match(dest.label,/Custom/);await new GCSItemImportService(dest).execute(await plan(),{confirmed:true});
 assert.equal(e.world.length,0);assert.equal(e.packed.length,2);assert.deepEqual(e.calls,[{pack:'world.custom',renderSheet:false},{pack:'world.custom',renderSheet:false}]);
 assert.ok(e.packed.every(i=>!Object.hasOwn(i,'folder')));
 assert.equal((await new GCSItemImportService(dest).execute(await plan(),{confirmed:true})).skipped,2);
});
test('identical content can exist in world and pack; cancel writes neither',async()=>{
 const e=env(),data=await plan(),world=createGCSImportDestination({},e),pack=createGCSImportDestination({packId:e.pack.collection},e);
 await new GCSItemImportService(pack).execute(data,{confirmed:false});assert.equal(e.calls.length,0);
 assert.equal((await new GCSItemImportService(world).execute(data,{confirmed:true})).created,2);
 assert.equal((await new GCSItemImportService(pack).execute(data,{confirmed:true})).created,2);
 assert.equal(e.world.length,2);assert.equal(e.packed.length,2);
});
test('locked, wrong-type or unauthorized packs are rejected at opening',()=>{
 for(const mutate of [e=>e.pack.locked=true,e=>e.pack.documentName='Actor',e=>e.revoke(),e=>e.pack.documentClass.canUserCreate=()=>false,e=>e.game.user.isGM=false]){
  const e=env();mutate(e);assert.throws(()=>createGCSImportDestination({packId:e.pack.collection},e));assert.equal(e.calls.length,0);
 }
});
test('relock, removal or replacement after preview never falls back to world',async()=>{
 for(const mutate of [e=>e.pack.locked=true,e=>e.game.packs.delete(e.pack.collection),e=>e.game.packs.set(e.pack.collection,{...e.pack})]) {
  const e=env(),dest=createGCSImportDestination({packId:e.pack.collection},e);mutate(e);
  await assert.rejects(new GCSItemImportService(dest).execute(await plan(),{confirmed:true}));assert.equal(e.calls.length,0);assert.equal(e.world.length,0);
 }
});
test('permission loss during batch interrupts with previous creations reported',async()=>{
 const e=env(),create=e.Item.create;e.Item.create=async(...args)=>{const item=await create(...args);e.revoke();return item;};
 const dest=createGCSImportDestination({packId:e.pack.collection},e);
 const result=await new GCSItemImportService(dest).execute(await plan(),{confirmed:true});
 assert.equal(result.created,1);assert.equal(result.interrupted,true);assert.equal(e.packed.length,1);assert.equal(e.world.length,0);assert.ok(result.files[0].errors.length);
});
test('lost pack create response reconciles only against full destination documents',async()=>{
 const e=env(),create=e.Item.create;e.Item.create=async(...args)=>{await create(...args);throw Error('lost');};
 const dest=createGCSImportDestination({packId:e.pack.collection},e);
 const result=await new GCSItemImportService(dest).execute(await plan(),{confirmed:true});
 assert.equal(result.created,2);assert.equal(result.failed,0);assert.equal(e.world.length,0);
 assert.equal((await new GCSItemImportService(dest).execute(await plan(),{confirmed:true})).skipped,2);
});
