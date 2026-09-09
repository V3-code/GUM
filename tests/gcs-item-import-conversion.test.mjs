import test from 'node:test';
import assert from 'node:assert/strict';
import {convertGCSContent, traitCost} from '../module/utils/gcs-item-import-conversion.mjs';
test('trait points apply levels and enabled modifiers once',()=>{
 const node={name:'Trait',base_points:10,points_per_level:5,levels:2,modifiers:[{name:'A',cost_adj:'20%'},{name:'B',cost_adj:'-90%',disabled:true}]};
 assert.equal(traitCost(node).points,24);
 const {drafts}=convertGCSContent({version:5,rows:[node]},'adq','test.adq');
 assert.equal(drafts[0].system.points,24);assert.deepEqual(drafts[0].system.modifiers,{});
 assert.match(drafts[0].system.description,/20%/);
});
test('templates preserve root leaves, nested selections and portable items',()=>{
 const node={name:'Choices',template_picker:{type:'count',qualifier:{compare:'is',qualifier:1}},children:[{name:'A',base_points:1},{name:'B',base_points:2}]};
 const {drafts}=convertGCSContent({version:5,traits:[{name:'Root',base_points:3},node]},'gct','x.gct');
 assert.equal(drafts[0].type,'template');
 assert.equal(drafts[0].system.blocks[0].contents[0].inlineItem.name,'Root');
 assert.equal(drafts[0].system.blocks[0].contents[1].subBlocks[0].type,'selection');
 assert.equal(JSON.stringify(drafts).includes('Item.'),false);
 assert.throws(()=>convertGCSContent({traits:[{...node,template_picker:{type:'unknown'}}]},'gct','x.gct'),/escolha/i);
});
test('raw rules are preserved and HTML is escaped without executable effects',()=>{
 const {drafts,warnings}=convertGCSContent({rows:[{name:'<img src=x onerror=1>',base_points:10,local_notes:'<script>bad</script>',features:[{type:'attribute_bonus',attribute:'st',amount:3}]}]},'adq','x.adq');
 assert.ok(warnings.length);assert.match(drafts[0].system.description,/&lt;script&gt;/);
 assert.deepEqual(drafts[0].effects,[]);assert.ok(drafts[0].flags.gum.gcsImport.source.features);
});
test('equipment and spell-only templates preserve price, points and level from adapter',()=>{
 const data={equipment:[{name:'Bag',base_value:30,quantity:2}],spells:[{name:'Spell',points:2}]};
 const {drafts}=convertGCSContent(data,'gct','mixed.gct',{spl:()=>({type:'spell',system:{skill_level:-1}})});
 const entries=drafts[0].system.blocks.flatMap(b=>b.contents);
 assert.equal(entries.find(e=>e.name==='Bag').cost,30);
 assert.equal(entries.find(e=>e.name==='Spell').level,-1);
 assert.equal(entries.find(e=>e.name==='Spell').inlineItem.system.auto_points,false);
});
test('exact choices retain persistent warning, at-most does not, group budgets use aggregate cost',()=>{
 const group={name:'Package',children:[{name:'A',base_points:10},{name:'B',base_points:5}]};
 const template=compare=>({traits:[{name:'Buy',template_picker:{type:'points',qualifier:{compare,qualifier:20}},children:[group]}]});
 const exact=convertGCSContent(template('is'),'gct','exact.gct');
 assert.match(exact.drafts[0].system.description,/Buy.*exatamente 20/);
 const max=convertGCSContent(template('at_most'),'gct','max.gct');
 assert.equal(max.warnings.length,0);
 assert.equal(max.drafts[0].system.blocks[0].contents[0].subBlocks[0].contents[0].cost,15);
 group.template_picker={type:'count',qualifier:{compare:'is',qualifier:1}};
 assert.throws(()=>convertGCSContent(template('is'),'gct','variable.gct'),/custo variável/);
});
test('meta-trait in adq preserves its parent as a portable Model',()=>{
 const source={name:'Meta',reference:'B1',container_type:'meta_trait',children:[{name:'Child',base_points:5}],calc:{points:5}};
 const {drafts}=convertGCSContent({rows:[source]},'adq','x.adq');
 assert.equal(drafts.length,1);assert.equal(drafts[0].type,'template');assert.equal(drafts[0].name,'Meta');
 assert.equal(drafts[0].system.blocks[0].contents[0].cost,5);
});
test('unknown trait cost is prominently marked and disabled modifiers do not change known totals',()=>{
 assert.deepEqual(traitCost({base_points:2,modifiers:[{cost_adj:'3',disabled:true}]}),{points:2,known:true});
 const result=convertGCSContent({rows:[{name:'Uncertain',base_points:10,cr:12}]},'adq','x.adq');
 assert.match(result.drafts[0].system.description,/PENDÊNCIA/);assert.match(result.warnings[0],/custo/);
 assert.equal(traitCost({base_points:5,modifiers:[{cost_adj:'30%'}]}).points,7);
});
test('template equipment container keeps the bag itself and its child exactly once',()=>{
 const data={equipment:[{id:'E123',description:'Bag',base_value:'10',base_weight:'2 lb',quantity:2,children:[{id:'e123',description:'Tool',base_value:'5'}]}]};
 const seen=[];
 const {drafts}=convertGCSContent(data,'gct','gear.gct',{eqp:node=>{seen.push(node);return {type:'equipment',system:{}};}});
 const group=drafts[0].system.blocks[0].contents[0];const entries=group.subBlocks[0].contents;
 assert.deepEqual(entries.map(e=>e.name),['Bag','Tool']);assert.equal(entries[0].cost,10);assert.equal(entries[0].quantity,2);assert.equal(entries[0].inlineItem.system.weight,0.90718474);
 assert.equal(seen[0].children,undefined);assert.equal(seen.length,2);
});
test('root meta-trait becomes a named block with direct individual items and preserved metadata',()=>{
 const root={id:'Tmeta',name:'Spirit',container_type:'meta_trait',reference:'B1',local_notes:'Remember this',calc:{points:15},children:[{name:'First',base_points:10},{name:'Second',base_points:5}]};
 const {drafts}=convertGCSContent({version:5,traits:[root]},'gct','Spirit.gct');
 const model=drafts[0];assert.equal(model.system.blocks.length,1);
 const block=model.system.blocks[0];assert.equal(block.title,'Spirit');assert.equal(block.type,'guaranteed');
 assert.deepEqual(block.contents.map(e=>[e.kind,e.name,e.cost]),[['item','First',10],['item','Second',5]]);
 assert.match(model.system.description,/Remember this/);assert.match(model.system.description,/B1/);
 assert.deepEqual(model.flags.gum.gcsImport.source.traits[0],root);
 assert.equal(model.flags.gum.gcsImport.modelStructureRevision,2);
});
test('root promotion preserves mixed order and internal choices without flattening real groups',()=>{
 const leaf=name=>({name,base_points:1});
 const choice={name:'Choose',template_picker:{type:'count',qualifier:{compare:'at_most',qualifier:1}},children:[leaf('Option A'),leaf('Option B')]};
 const meta=(name,children)=>({name,container_type:'meta_trait',children});
 const {drafts}=convertGCSContent({traits:[leaf('Loose first'),meta('One',[leaf('Guaranteed'),choice]),leaf('Between'),meta('Two',[leaf('Last')])]},'gct','mixed.gct');
 const blocks=drafts[0].system.blocks;
 assert.deepEqual(blocks.map(b=>b.title),['Características','One','Características','Two']);
 assert.equal(blocks[1].contents[1].kind,'group');assert.equal(blocks[1].contents[1].subBlocks[0].type,'selection');
 assert.deepEqual(blocks[1].contents[1].subBlocks[0].contents.map(e=>e.name),['Option A','Option B']);
 assert.equal(blocks[3].contents[0].name,'Last');
});
