import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../module/utils/template-application-plan.mjs').catch(() => ({}));
const removal = await import('../module/utils/template-removal-plan.mjs').catch(() => ({}));
const fixture = () => ({system:{attributes:Object.fromEntries(['st','dx','ht','iq','vont','per','lifting_st','vision','hearing','tastesmell','touch','basic_speed','basic_move','dodge'].map(k=>[k,{value:k==='basic_speed'?5:10}])),points:{unspent:0},applied_models:[]}});
const damage = st => ({thrust:`${st} thrust`,swing:`${st} swing`});
const entry = (attributes, linkSecondary=false) => ({id:'attribute',kind:'attribute',attributes,linkSecondary});
function apply(source, entries, id) {
  const plan=api.buildTemplateApplicationPlan(source,entries,{applicationId:id,template:{id,name:id,uuid:id},damage});
  return api.applyTemplatePatch(source,{...plan.updateData,'system.applied_models':plan.records});
}
function remove(source,id,items=[]) {
  const plan=removal.buildTemplateRemovalPlan(source,id,items);
  return {plan,source:api.applyTemplatePatch(source,{...plan.updateData,'system.applied_models':plan.records})};
}
test('preflight rejects missing resolved items and unknown attribute without mutating source',()=>{
  assert.equal(typeof api.buildTemplateApplicationPlan,'function','application planner exists');
  const s=fixture(), before=structuredClone(s);
  assert.throws(()=>apply(s,[{id:'bad',kind:'item',name:'Missing'}],'A'),/Missing|resolvid/);
  assert.throws(()=>apply(s,[entry({unknown:1})],'A'),/unknown/);
  assert.throws(()=>apply(s,[entry({st:'NaN'})],'A'),/finito/);
  assert.deepEqual(s,before);
});
test('PV/PF affect only maxima and unlink does not touch tato',()=>{
  const s=fixture();s.system.attributes.hp={value:7,max:11};s.system.attributes.fp={value:6,max:12};s.system.attributes.touch.value=17;
  const a=apply(s,[entry({hp:2,fp:3})],'A');
  assert.deepEqual(a.system.attributes.hp,{value:7,max:13});
  assert.deepEqual(remove(a,'A').source.system.attributes,s.system.attributes);
  const linked=apply(s,[entry({st:2},true)],'A');
  assert.equal(linked.system.attributes.hp.value,7);
  assert.deepEqual(remove(linked,'A').source.system.attributes,s.system.attributes);
});
test('two linked models remove in both orders without resurrecting damage or losing personalized bases',()=>{
  for(const order of [['A','B'],['B','A']]) {
    const s=fixture();s.system.attributes.hp={value:8,max:17};s.system.attributes.fp={value:8,max:14};
    s.system.attributes.thrust_damage='custom';s.system.attributes.swing_damage='custom swing';s.system.attributes.dodge.gcs_imported_fixed=9;
    const ab=apply(apply(s,[entry({st:2},true)],'A'),[entry({st:3},true)],'B');
    const first=remove(ab,order[0]).source;
    assert.equal(first.system.attributes.st.value,order[0]==='A'?13:12);
    assert.deepEqual(remove(first,order[1]).source.system.attributes,s.system.attributes);
  }
});
test('manual derived edits survive both removals while explicit deltas still leave',()=>{
  const s=fixture();s.system.attributes.hp={value:8,max:10};s.system.attributes.fp={value:8,max:10};
  const ab=apply(apply(s,[entry({st:2,hp:1},true)],'A'),[entry({st:3},true)],'B');
  ab.system.attributes.hp.max=30;ab.system.attributes.thrust_damage='manual';ab.system.attributes.st.value+=1;
  const first=remove(ab,'A').source;
  assert.equal(first.system.attributes.hp.max,29);
  const final=remove(first,'B').source;
  assert.equal(final.system.attributes.hp.max,29);assert.equal(final.system.attributes.st.value,11);assert.equal(final.system.attributes.thrust_damage,'manual');
});
test('legacy keeps uncertain items and secondaries, reverses original PV value only',()=>{
  const s=fixture();s.system.attributes.hp={value:12,max:15};
  s.system.applied_models=[{applicationId:'old',createdItemIds:['i'],attributeChanges:[{key:'hp',amount:2}],secondaryRecalcApplied:true}];
  const {plan,source}=remove(s,'old',[{_id:'i',name:'edited',flags:{gum:{templateApplicationId:'old'}}}]);
  assert.equal(source.system.attributes.hp.value,10);assert.equal(source.system.attributes.hp.max,15);assert.equal(plan.deleteIds.length,0);
});
test('item ownership checks identity and flags; edited source is preserved',()=>{
  const s=apply(fixture(),[entry({st:1})],'A');
  const raw={_id:'i',name:'Original',type:'skill',system:{points:2},flags:{gum:{templateApplicationId:'A'}}};
  s.system.applied_models[0].createdItems=[{id:'i',projection:api.templateItemProjection(raw)}];
  assert.deepEqual(remove(s,'A',[raw]).plan.deleteIds,['i']);
  assert.deepEqual(remove(s,'A',[{...raw,name:'Edited'}]).plan.unlinkIds,['i']);
  assert.deepEqual(remove(s,'A',[{...raw,flags:{gum:{templateApplicationId:'B'}}}]).plan.deleteIds,[]);
});
test('journal cannot mutate paths outside model-owned fields',()=>{
  const s=apply(fixture(),[entry({st:1})],'A');
  s.system.applied_models[0].fields[0].path='system.biography';
  assert.throws(()=>remove(s,'A'),/caminho|Caminho/);
});
test('new derived lineage after manual edit survives removing an earlier explicit contribution',()=>{
  const s=fixture();s.system.attributes.hp={value:8,max:10};s.system.attributes.fp={value:8,max:10};
  const a=apply(s,[entry({st:2,hp:1},true)],'A');a.system.attributes.hp.max=30;
  const b=apply(a,[entry({st:3},true)],'B');
  const noA=remove(b,'A').source;
  // B changed 30 to 15. A's explicit +1 leaves, and B still owns its -15 change.
  assert.equal(noA.system.attributes.hp.max,14);
  assert.equal(remove(noA,'B').source.system.attributes.hp.max,29);
});
test('strict blocks validate nested groups and reject duplicates and unknown kinds',()=>{
  api.validateTemplateBlocks([{id:'b',type:'points',pointsAvailable:-10,contents:[{id:'g',kind:'group',cost:-2,subBlocks:[{id:'nested',type:'selection',choiceCount:1,contents:[]}]}]}]);
  assert.throws(()=>api.validateTemplateBlocks([{id:'x',type:'invalid',contents:[]}]),/desconhecido/);
  assert.throws(()=>api.validateTemplateBlocks([{id:'x',type:'guaranteed',contents:[{id:'a',kind:'item'},{id:'a',kind:'item'}]}]),/repetido/);
});
test('zero net change still owns explicit delta when derived contribution cancels it',()=>{
  const s=fixture();s.system.attributes.hp={value:8,max:13};s.system.attributes.fp={value:8,max:10};
  const a=apply(s,[entry({st:2,hp:1},true)],'A');
  assert.equal(a.system.attributes.hp.max,13);
  a.system.attributes.hp.max=30;
  assert.equal(remove(a,'A').source.system.attributes.hp.max,29);
});
