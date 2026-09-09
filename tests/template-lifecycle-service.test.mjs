import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTemplatePatch,buildTemplateApplicationPlan,cloneTemplateData} from '../module/utils/template-application-plan.mjs';
const api=await import('../module/services/template-application-service.mjs').catch(()=>({}));
function fixture() {
  let source={system:{attributes:{st:{value:10}},points:{unspent:0},applied_models:[]}},items=[],id=0;
  const calls=[],failures=[];
  const step=async(name,change)=>{calls.push(name);const f=failures.find(f=>f.name===name&&!f.used);if(f) f.used=true;if(f?.when==='before') throw Error('offline');const result=change();if(f?.when==='after') throw Error('reply lost');return result;};
  const ports={key:'fixture'+Math.random(),read:()=>step('read',()=>({source:cloneTemplateData(source),items:cloneTemplateData(items)})),
    update:patch=>step('update',()=>{source=applyTemplatePatch(source,patch);}),
    create:payload=>step('create',()=>{const item={...cloneTemplateData(payload),_id:`i${++id}`};items.push(item);return item;}),
    delete:itemId=>step('delete',()=>{items=items.filter(i=>i._id!==itemId);}),
    unlink:itemId=>step('unlink',()=>{const i=items.find(i=>i._id===itemId);if(i){delete i.flags.gum.templateApplicationId;delete i.flags.gum.templateApplied;delete i.flags.gum.templateEntryKey;}}),
    now:()=> '2026-09-09'};
  const plan=()=>buildTemplateApplicationPlan(source,[{kind:'attribute',attributes:{st:2}},{id:'item',kind:'item',resolvedItem:{name:'Sword',type:'equipment',system:{quantity:1}}}],{applicationId:'A',template:{id:'A',uuid:'A',name:'A'}});
  return {ports,calls,failures,plan,get source(){return source;},get items(){return items;}};
}
test('application persists ownership at create and removal is idempotent',async()=>{
  assert.equal(typeof api.TemplateApplicationService,'function','service exists');
  const f=fixture(),s=new api.TemplateApplicationService(f.ports);
  assert.equal((await s.apply(f.plan())).status,'active');
  assert.equal(f.source.system.attributes.st.value,12);assert.equal(f.items[0].flags.gum.templateApplicationId,'A');
  assert.equal((await s.remove('A')).status,'removed');
  assert.equal((await s.resume('A')).status,'removed');assert.equal(f.source.system.attributes.st.value,10);assert.equal(f.items.length,0);
});
test('postcommit terminal reply loss is success and never triggers compensation',async()=>{
  const f=fixture(),original=f.ports.update;
  f.ports.update=async patch=>{await original(patch);if(patch['system.applied_models']?.some(r=>r.state==='active'||r.state==='removed'))throw Error('reply lost');};
  const s=new api.TemplateApplicationService(f.ports);
  assert.equal((await s.apply(f.plan())).status,'active');assert.equal(f.items.length,1);
  assert.equal((await s.remove('A')).status,'removed');assert.equal(f.source.system.attributes.st.value,10);
});
test('partial creation rolls back only owned documents, including lost reply',async()=>{
  for(const when of ['before','after']){
    const f=fixture(),s=new api.TemplateApplicationService(f.ports);f.failures.push({name:'create',when});
    const result=await s.apply(f.plan());assert.equal(result.status,'rolled-back');
    assert.equal(f.items.length,0);assert.equal(f.source.system.attributes.st.value,10);
    assert.equal((await s.resume('A')).status,'rolled-back');
  }
});
test('unlink failure stays pending and resume does not subtract attributes twice',async()=>{
  const f=fixture(),s=new api.TemplateApplicationService(f.ports);await s.apply(f.plan());f.items[0].name='Edited';
  f.failures.push({name:'unlink',when:'before'});
  assert.equal((await s.remove('A')).status,'pending');assert.equal(f.source.system.attributes.st.value,10);
  assert.equal(f.source.system.applied_models[0].state,'removing');
  assert.equal((await new api.TemplateApplicationService(f.ports).resume('A')).status,'removed');
  assert.equal(f.source.system.attributes.st.value,10);assert.equal(f.items[0].name,'Edited');assert.equal(f.items[0].flags.gum.templateApplicationId,undefined);
});
test('read unavailable after uncertain commit leaves pending, later resume recognizes active',async()=>{
  const f=fixture(),original=f.ports.update;
  f.ports.update=async patch=>{await original(patch);if(patch['system.applied_models']?.some(r=>r.state==='active')) {f.failures.push({name:'read',when:'before'});throw Error('reply lost');}};
  const s=new api.TemplateApplicationService(f.ports);
  assert.equal((await s.apply(f.plan())).status,'pending');assert.equal(f.items.length,1);
  assert.equal((await s.resume('A')).status,'active');assert.equal(f.source.system.attributes.st.value,12);
});
test('pending rollback blocks new application and survives delete reply loss',async()=>{
  const f=fixture(),s=new api.TemplateApplicationService(f.ports);f.failures.push({name:'create',when:'after'},{name:'delete',when:'after'});
  const result=await s.apply(f.plan());assert.equal(result.status,'pending');
  assert.throws(()=>f.plan(),/pendente/);
  assert.equal((await s.resume('A')).status,'rolled-back');assert.equal(f.source.system.attributes.st.value,10);
});
test('retry after persisted delete cleans only its orphan effects and is idempotent',async()=>{
  const f=fixture(),s=new api.TemplateApplicationService(f.ports);await s.apply(f.plan());
  let effects=[{origin:'i1'},{origin:'other'}],first=true;const original=f.ports.delete;
  f.ports.delete=async id=>{await original(id);if(first){first=false;throw Error('effect cleanup failed');}effects=effects.filter(e=>e.origin!==id);};
  assert.equal((await s.remove('A')).status,'pending');assert.equal(f.items.length,0);
  assert.equal((await s.resume('A')).status,'removed');assert.deepEqual(effects,[{origin:'other'}]);
  assert.equal((await s.resume('A')).status,'removed');assert.deepEqual(effects,[{origin:'other'}]);
});
test('lost create response with Foundry defaults still compensates authored payload',async()=>{
  const f=fixture(),s=new api.TemplateApplicationService(f.ports),original=f.ports.create;
  f.ports.create=async payload=>{const item=await original(payload);item.img='icons/default.svg';item.system.extraDefault=0;throw Error('lost');};
  assert.equal((await s.apply(f.plan())).status,'rolled-back');assert.equal(f.items.length,0);
});
test('stale confirmation is rejected before any write',async()=>{
  const f=fixture(),s=new api.TemplateApplicationService(f.ports),plan=f.plan();f.source.system.attributes.st.value=20;
  await assert.rejects(s.apply(plan),/mudou/);assert.equal(f.calls.filter(c=>c==='update').length,0);
});
test('failed removal journal is not mistaken for success of an earlier apply operation',async()=>{
  const f=fixture(),s=new api.TemplateApplicationService(f.ports);await s.apply(f.plan());
  f.failures.push({name:'update',when:'before'});
  await assert.rejects(s.remove('A'),/offline/);assert.equal(f.source.system.attributes.st.value,12);assert.equal(f.items.length,1);
});
test('lost unlink checkpoint reply resumes without repeated numeric removal',async()=>{
  const f=fixture(),s=new api.TemplateApplicationService(f.ports);await s.apply(f.plan());f.items[0].name='edit';
  const original=f.ports.update;let once=true;
  f.ports.update=async patch=>{await original(patch);if(once&&patch['system.applied_models']?.some(r=>r.phase==='unlink')){once=false;throw Error('lost checkpoint');}};
  assert.equal((await s.remove('A')).status,'pending');assert.equal(f.source.system.attributes.st.value,10);
  assert.equal((await s.resume('A')).status,'removed');assert.equal(f.source.system.attributes.st.value,10);
});
test('lost create plus offline read cannot adopt later edits as original ownership',async()=>{
  const f=fixture(),s=new api.TemplateApplicationService(f.ports),create=f.ports.create;
  f.ports.create=async payload=>{const item=await create(payload);f.failures.push({name:'read',when:'before'});throw Error('lost create reply');};
  assert.equal((await s.apply(f.plan())).status,'pending');
  f.items[0].name='Edited after reload';
  const resumed=new api.TemplateApplicationService(f.ports);
  assert.equal((await resumed.resume('A')).status,'rolled-back');
  assert.equal(f.items.length,1);assert.equal(f.items[0].name,'Edited after reload');
  assert.equal(f.items[0].flags.gum.templateApplicationId,undefined);
});
test('uncheckpointed creation with failed hook never resumes active without its effect',async()=>{
  const f=fixture(),s=new api.TemplateApplicationService(f.ports),create=f.ports.create;
  f.ports.create=async payload=>{await create(payload);f.failures.push({name:'read',when:'before'});throw Error('mandatory hook failed');};
  assert.equal((await s.apply(f.plan())).status,'pending');
  assert.equal((await new api.TemplateApplicationService(f.ports).resume('A')).status,'rolled-back');
  assert.equal(f.items.length,0);assert.equal(f.source.system.attributes.st.value,10);
});
test('persisted application journal is validated before any resume mutation',async()=>{
  for(const corrupt of [
    r=>{r.plan.updateData={name:'unauthorized'};},
    r=>{r.plan.items[0].type='effect';},
    r=>{r.plan.items[0].flags.gum.templateApplicationId='someone-else';},
    r=>{if(r.plan.updates)r.plan.updates.find(e=>e.path==='system.attributes.st.value').value='not-a-number';else r.plan.updateData['system.attributes.st.value']='not-a-number';}
  ]) {
    const f=fixture(),s=new api.TemplateApplicationService(f.ports),create=f.ports.create;
    f.ports.create=async payload=>{await create(payload);f.failures.push({name:'read',when:'before'});throw Error('lost');};
    await s.apply(f.plan());corrupt(f.source.system.applied_models[0]);
    const writes=f.calls.filter(c=>c!=='read').length;
    await assert.rejects(new api.TemplateApplicationService(f.ports).resume('A'),/Journal inválido/);
    assert.equal(f.calls.filter(c=>c!=='read').length,writes);assert.equal(f.source.name,undefined);
  }
});
test('Foundry recursively expands dotted object keys inside journal arrays',async()=>{
  const f=fixture(),s=new api.TemplateApplicationService(f.ports),update=f.ports.update;
  const expand=value=>{
    if(Array.isArray(value)) return value.map(expand);
    if(value&&typeof value==='object') {
      const out={};for(const [key,entry] of Object.entries(value)) {
        const parts=key.split('.');let target=out;
        for(const part of parts.slice(0,-1)) target=target[part]??={};
        target[parts.at(-1)]=expand(entry);
      }return out;
    }return value;
  };
  f.ports.update=patch=>update(Object.fromEntries(Object.entries(patch).map(([key,value])=>[key,expand(value)])));
  assert.equal((await s.apply(f.plan())).status,'active');
  assert.equal(f.source.system.attributes.st.value,12);
  assert.equal((await new api.TemplateApplicationService(f.ports).remove('A')).status,'removed');
  assert.equal(f.source.system.attributes.st.value,10);
});
test('legacy nested journal resumes safely while nested out-of-scope paths are rejected',async()=>{
  for(const forbidden of [false,true]) {
    const f=fixture(),s=new api.TemplateApplicationService(f.ports),update=f.ports.update;
    let first=true;
    f.ports.update=async patch=>{await update(patch);if(first){first=false;f.failures.push({name:'read',when:'before'});throw Error('journal reply lost');}};
    assert.equal((await s.apply(f.plan())).status,'pending');
    const stored=f.source.system.applied_models[0].plan;
    stored.updateData={system:{attributes:{st:{value:12}}}};delete stored.updates;
    if(forbidden) stored.updateData.system.biography={name:'unapproved'};
    const writes=f.calls.filter(c=>c!=='read').length;
    if(forbidden) {
      await assert.rejects(new api.TemplateApplicationService(f.ports).resume('A'),/Journal inválido/);
      assert.equal(f.calls.filter(c=>c!=='read').length,writes);
    } else {
      assert.equal((await new api.TemplateApplicationService(f.ports).resume('A')).status,'active');
      assert.equal(f.source.system.attributes.st.value,12);
    }
  }
});
