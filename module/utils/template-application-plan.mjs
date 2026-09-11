// Source-data only: never feed prepared Actor.system values to this planner.
export const TEMPLATE_ITEM_TYPES = new Set(['skill','spell','power','advantage','disadvantage','equipment']);
const attributeKeys = {st:'st',dx:'dx',iq:'iq',ht:'ht',will:'vont',per:'per',hp:'hp',fp:'fp',basic_speed:'basic_speed',move:'basic_move'};
export const cloneTemplateData = value => JSON.parse(JSON.stringify(value));
export const templateRecordActive = r => !r.removedAt && !['removed','rolled-back'].includes(r.state);
export const templatePending = r => templateRecordActive(r) && ['applying','removing','recovery-required'].includes(r.state);
export const templateGet = (object,path) => path.split('.').reduce((o,k)=>o?.[k],object);
export const templateEqual = (a,b) => typeof a==='number' && typeof b==='number' ? Math.abs(a-b)<1e-9 : JSON.stringify(a)===JSON.stringify(b);
export const templateCell = (source,path) => {const value=templateGet(source,path);return value===undefined?{exists:false}:{exists:true,value};};
export const templateSnapshot = source => cloneTemplateData({attributes:source.system?.attributes||{},points:source.system?.points||{},records:source.system?.applied_models||[]});
export function templateWrite(update,path,cell) {
  if(cell.exists) update[path]=cell.value;
  else {const keys=path.split('.');const key=keys.pop();update[`${keys.join('.')}.-=${key}`]=null;}
}
export function applyTemplatePatch(source,patch) {
  const result=cloneTemplateData(source);
  for(const [path,value] of Object.entries(patch)) {
    const keys=path.split('.');let target=result;
    for(const key of keys.slice(0,-1)) {
      if(['__proto__','prototype','constructor'].includes(key)) throw new Error('Caminho inválido');
      target=target[key]??= {};
    }
    const key=keys.at(-1);
    if(key.startsWith('-=')) delete target[key.slice(2)]; else target[key]=cloneTemplateData(value);
  }
  return result;
}
function finite(value,label) {
  if(value===null || value==='' || !['number','string'].includes(typeof value) || !Number.isFinite(Number(value))) throw new Error(`${label}: número finito obrigatório`);
  return Number(value);
}
export function validateTemplateBlocks(blocks, depth=0, seen=new Set()) {
  if(!Array.isArray(blocks)||depth>20) throw new Error('Estrutura de blocos inválida (limite: 20 níveis)');
  for(const block of blocks) {
    if(!block || !['guaranteed','selection','points'].includes(block.type)) throw new Error(`Bloco desconhecido: ${block?.type}`);
    if(!block.id || seen.has(block.id)) throw new Error(`ID de bloco repetido ou ausente: ${block.id}`);
    seen.add(block.id);
    if(!Array.isArray(block.contents)) throw new Error(`Bloco ${block.id}: conteúdo inválido`);
    if(block.type==='selection' && (!Number.isInteger(finite(block.choiceCount??1,block.id)) || Number(block.choiceCount??1)<1)) throw new Error(`Bloco ${block.id}: quantidade inválida`);
    if(block.type==='points') finite(block.pointsAvailable??0,block.id);
    const entries=new Set();
    for(const entry of block.contents) {
      if(!entry?.id || entries.has(entry.id)) throw new Error(`Bloco ${block.id}: ID de entrada repetido ou ausente`);
      entries.add(entry.id);
      if(!['attribute','item','group'].includes(entry.kind)) throw new Error(`Entrada ${entry.id}: tipo desconhecido ${entry.kind}`);
      if(entry.cost!==undefined) finite(entry.cost,entry.id);
      if(entry.subBlocks!==undefined) validateTemplateBlocks(entry.subBlocks,depth+1,seen);
    }
  }
}
export function templateItemProjection(item) {
  const flags=cloneTemplateData(item.flags||{});
  if(flags.gum) {delete flags.gum.templateApplicationId;delete flags.gum.templateApplied;delete flags.gum.templateEntryKey;if(!Object.keys(flags.gum).length) delete flags.gum;}
  return {name:item.name,type:item.type,img:item.img??null,system:cloneTemplateData(item.system||{}),flags};
}
export function buildTemplateApplicationPlan(source,entries,{applicationId,template,damage,pointsLeftoverTotal=0,overrides={}}) {
  const records=cloneTemplateData(source.system?.applied_models||[]);
  if(records.some(templatePending)) throw new Error('Há uma operação de modelo pendente. Use Retomar.');
  if(records.some(r=>templateRecordActive(r)&&(r.templateUuid===template.uuid || (!r.templateUuid && r.templateId===template.id)))) throw new Error('Modelo já aplicado');
  const deltas={},items=[];let linked=false;
  for(const entry of entries) {
    const label=entry.name||entry.id||'Entrada';
    if(entry.kind==='attribute') {
      for(const [key,raw] of Object.entries(entry.attributes||{})) {
        if(!Object.hasOwn(attributeKeys,key)) throw new Error(`${label}: atributo desconhecido ${key}`);
        const attr=attributeKeys[key];const path=`system.attributes.${attr}.${['hp','fp'].includes(attr)?'max':'value'}`;
        deltas[path]=(deltas[path]||0)+finite(raw,`${label}/${key}`);
      }
      linked ||= entry.linkSecondary===true;
    } else if(entry.kind==='item') {
      const data=entry.resolvedItem;
      if(!data || !TEMPLATE_ITEM_TYPES.has(data.type)) throw new Error(`${label}: item não resolvido ou tipo não permitido`);
      if(!data.name || !data.system || typeof data.system!=='object') throw new Error(`${label}: item inválido`);
      for(const key of ['cost','level','quantity']) if(entry[key]!==undefined && entry[key]!=='' && entry[key]!==null) finite(entry[key],`${label}/${key}`);
      const item=cloneTemplateData(data);delete item._id;delete item.id;delete item._stats;delete item.folder;delete item.ownership;
      item.flags??={};item.flags.gum??={};item.flags.gum.templateApplicationId=applicationId;
      item.flags.gum.templateEntryKey=String(items.length);
      items.push(item);
    } else throw new Error(`${label}: entrada desconhecida ${entry.kind}`);
  }
  const leftover=finite(pointsLeftoverTotal,'Saldo');if(leftover) deltas['system.points.unspent']=leftover;
  const updateData={};
  for(const [path,delta] of Object.entries(deltas)) if(delta) updateData[path]=finite(templateGet(source,path)??0,path)+delta;
  const proposed=applyTemplatePatch(source,updateData), attrs=proposed.system.attributes;
  const primaryChanged=['st','dx','ht','iq','per'].some(k=>deltas[`system.attributes.${k}.value`]);
  if(linked && primaryChanged) {
    const n=k=>finite(attrs[k]?.value??0,k), st=n('st'),ht=n('ht'),per=n('per');
    const speed=Math.round(((n('dx')+ht)/4)*100)/100;
    const values={ 'hp.max':st,'fp.max':ht,'lifting_st.value':st,'vision.value':per,'hearing.value':per,'tastesmell.value':per,
      'basic_speed.value':speed,'basic_move.value':Math.floor(speed),'dodge.value':Math.floor(speed+(deltas['system.attributes.basic_speed.value']||0))+3 };
    for(const [key,value] of Object.entries(values)) {
      const attr=key.split('.')[0];if(overrides[attr]!==null && overrides[attr]!==undefined) continue;
      const path=`system.attributes.${key}`;updateData[path]=value+(deltas[path]||0);
    }
    const dice=damage(st);updateData['system.attributes.thrust_damage']=dice.thrust;updateData['system.attributes.swing_damage']=dice.swing;
    if(overrides.dodge===null || overrides.dodge===undefined) updateData['system.attributes.dodge.-=gcs_imported_fixed']=null;
  }
  const after=applyTemplatePatch(source,updateData),fields=[];
  for(const rawPath of Object.keys(updateData)) {
    const path=rawPath.replace('.-=','.');const before=templateCell(source,path),next=templateCell(after,path);
    if(templateEqual(before,next)) {
      delete updateData[rawPath];
      // An explicit purchase remains owned even if a linked recalculation cancels its net change.
      if(!deltas[path]) continue;
    }
    const previous=records.filter(templateRecordActive).flatMap(r=>r.fields||[]).filter(f=>f.path===path&&!f.detached).at(-1);
    const intact=previous && templateEqual(previous.expected,before);
    const lineage=intact?previous.lineage:`${applicationId}:${path}`;
    const base=intact?previous.base:before;
    const numeric=next.exists && typeof next.value==='number' && (!before.exists||typeof before.value==='number');
    const field={path,before,after:next,base,lineage,expected:next,explicit:deltas[path]||0,numeric,detached:false};
    field.delta=numeric?next.value-(before.value??0):0;
    for(const r of records.filter(templateRecordActive)) for(const f of r.fields||[]) if(f.path===path&&f.lineage===lineage) f.expected=next;
    fields.push(field);
  }
  const record={schemaVersion:2,applicationId,operationId:applicationId,templateId:template.id,templateUuid:template.uuid,templateName:template.name,
    state:'active',fields,createdItems:[],createdItemIds:[],pointsLeftover:leftover};
  records.push(record);
  return {record,records,items,updateData,baseline:templateSnapshot(source)};
}
