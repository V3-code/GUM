import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../module/utils/template-operation-tracker.mjs').catch(()=>({}));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('CRUD waits for synchronously registered async hook even when it returns first',async()=>{
  assert.equal(typeof api.runTemplateDocumentOperation,'function');
  const gate=deferred(),effects=[];let settled=false;
  const item={id:'i',parent:{uuid:'Actor.a'},flags:{gum:{templateApplicationId:'A'}}};
  const hook=api.trackTemplateDocumentHook('create',async()=>{await gate.promise;effects.push('effect');});
  const op=api.runTemplateDocumentOperation({actorUuid:'Actor.a',userId:'u',kind:'create',applicationId:'A'},async options=>{hook(item,options,'u');return item;}).then(()=>{settled=true;});
  await Promise.resolve();assert.equal(settled,false);gate.resolve();await op;assert.deepEqual(effects,['effect']);
});
test('fast hook rejection remains visible and partial CRUD still drains',async()=>{
  const item={id:'i',parent:{uuid:'Actor.a'},flags:{gum:{templateApplicationId:'A'}}};
  const hook=api.trackTemplateDocumentHook('create',async()=>{throw Error('hook failed');});
  await assert.rejects(api.runTemplateDocumentOperation({actorUuid:'Actor.a',userId:'u',kind:'create',applicationId:'A'},async options=>{hook(item,options,'u');await Promise.resolve();return item;}),/hook failed/);
  const gate=deferred();let finished=false;
  const slow=api.trackTemplateDocumentHook('create',async()=>{await gate.promise;finished=true;});
  const op=api.runTemplateDocumentOperation({actorUuid:'Actor.a',userId:'u',kind:'create',applicationId:'A'},async options=>{slow(item,options,'u');throw Error('partial');});
  gate.resolve();await assert.rejects(op,/partial/);assert.equal(finished,true);
});
test('unlink bypass only registered matching scope and exact provenance payload',async()=>{
  const item={id:'i',parent:{uuid:'Actor.a'},flags:{gum:{templateApplicationId:'A'}}};let calls=0;
  const hook=api.trackTemplateDocumentHook('update',async()=>{calls++;});
  const change={'flags.gum.-=templateApplicationId':null};
  await hook(item,change,{gumTemplateOperation:{id:'bogus'}},'u');assert.equal(calls,1);
  await api.runTemplateDocumentOperation({actorUuid:'Actor.a',userId:'u',kind:'unlink',applicationId:'A',itemIds:['i'],changes:change},async options=>{hook(item,change,options,'u');});assert.equal(calls,1);
  await assert.rejects(api.runTemplateDocumentOperation({actorUuid:'Actor.a',userId:'u',kind:'unlink',applicationId:'A',itemIds:['i'],changes:{...change,system:{points:4}}},async options=>hook(item,{...change,system:{points:4}},options,'u')),/proveniência/);
});
test('create immediately followed by delete cannot leave the delayed effect orphaned',async()=>{
  const gate=deferred(),item={id:'i',parent:{uuid:'Actor.a'},flags:{gum:{templateApplicationId:'A'}}};let effects=[];
  const create=api.trackTemplateDocumentHook('create',async()=>{await gate.promise;effects.push({id:'ae',origin:'i',disabled:true});});
  const remove=api.trackTemplateDocumentHook('delete',async()=>{effects=effects.filter(e=>e.origin!=='i');});
  const flow=(async()=>{
    await api.runTemplateDocumentOperation({actorUuid:'Actor.a',userId:'u',kind:'create',applicationId:'A'},async options=>create(item,options,'u'));
    await api.runTemplateDocumentOperation({actorUuid:'Actor.a',userId:'u',kind:'delete',itemIds:['i']},async options=>remove(item,options,'u'));
  })();
  gate.resolve();await flow;assert.deepEqual(effects,[]);
});
test('registered unlink accepts real Foundry managed metadata without rearming a disabled effect',async()=>{
  const item={id:'ExJNzvke4XEkevZJ',parent:{uuid:'Actor.a'},flags:{gum:{}}};
  const original={id:'old-effect',disabled:true};let effects=[original],calls=0;
  const hook=api.trackTemplateDocumentHook('update',async()=>{calls++;effects=[{id:'new-effect',disabled:false}];});
  const input={_id:item.id,'flags.gum.-=templateApplicationId':null,'flags.gum.-=templateApplied':null,'flags.gum.-=templateEntryKey':null};
  const actual={flags:{gum:{templateApplicationId:{'__$OPERATOR$__':'ForcedDeletion'},templateApplied:{'__$OPERATOR$__':'ForcedDeletion'},templateEntryKey:{'__$OPERATOR$__':'ForcedDeletion'}}},_stats:{modifiedTime:1788950291777},_id:item.id};
  const run=changes=>api.runTemplateDocumentOperation({actorUuid:'Actor.a',userId:'u',kind:'unlink',itemIds:[item.id],changes:input},async options=>hook(item,changes,options,'u'));
  await run(actual);assert.equal(calls,0);assert.equal(effects[0],original);assert.equal(effects[0].disabled,true);
  await run({...actual,system:{points:5}});assert.equal(calls,1);
  await run({...actual,_stats:{modifiedTime:1788950291777,unknown:1}});assert.equal(calls,2);
  await run({...actual,_stats:{compendiumSource:'Item.other'}});assert.equal(calls,3);
  await assert.rejects(api.runTemplateDocumentOperation({actorUuid:'Actor.a',userId:'u',kind:'unlink',itemIds:[item.id],changes:{...input,_stats:{modifiedTime:1788950291777}}},async()=>{}),/proveniência/);
});
