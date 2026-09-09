import {TEMPLATE_ITEM_TYPES} from './template-application-plan.mjs';

export class TemplateJournalValidationError extends Error {
  constructor(detail) {super(`Journal inválido: ${detail}. Operação bloqueada antes de novas alterações.`);}
}
const invalid=detail=>{throw new TemplateJournalValidationError(detail);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const id=value=>typeof value==='string'&&value.length>0;
const numberPath=/^system\.(points\.unspent|attributes\.((st|dx|iq|ht|vont|per|lifting_st|vision|hearing|tastesmell|touch|basic_speed|basic_move|dodge)\.value|(hp|fp)\.(max|value)))$/;
const damagePath=/^system\.attributes\.(thrust_damage|swing_damage)$/;

export function templateStoredUpdates(plan) {
  const result={};
  const add=(path,value)=>{
    if(!id(path)||Object.hasOwn(result,path)||path.split('.').some(key=>['__proto__','constructor','prototype'].includes(key))) invalid('caminho repetido ou inválido');
    result[path]=value;
  };
  if(plan.updates!==undefined) {
    if(plan.updateData!==undefined||!Array.isArray(plan.updates)) invalid('representação de alterações ambígua');
    for(const entry of plan.updates) {
      if(!object(entry)||!Object.hasOwn(entry,'value')) invalid('alteração sem valor');
      add(entry.path,entry.value);
    }
  } else {
    if(!object(plan.updateData)) invalid('alterações ausentes');
    // Compatibility with a journal already expanded by Foundry. Validation below stays exact.
    const visit=(value,prefix='')=>{
      for(const [key,child] of Object.entries(value)) {
        if(['__proto__','constructor','prototype'].includes(key)) invalid('chave inválida');
        const path=prefix?`${prefix}.${key}`:key;
        if(object(child)) visit(child,path);else add(path,child);
      }
    };
    visit(plan.updateData);
  }
  return result;
}

export function serializeTemplateStoredPlan(plan) {
  const copy=JSON.parse(JSON.stringify(plan));
  copy.updates=Object.entries(templateStoredUpdates(plan)).map(([path,value])=>({path,value}));
  delete copy.updateData;
  return copy;
}

export function validateTemplateStoredPlan(plan,applicationId) {
  if(!object(plan)||!Array.isArray(plan.items)||!Array.isArray(plan.records)||!object(plan.baseline)) invalid('plano incompleto');
  if(plan.record?.applicationId!==applicationId||plan.record?.operationId!==applicationId) invalid('identidade da aplicação');
  for(const [path,value] of Object.entries(templateStoredUpdates(plan))) {
    if(numberPath.test(path)) {if(typeof value!=='number'||!Number.isFinite(value)) invalid(`valor de ${path}`);}
    else if(damagePath.test(path)) {if(typeof value!=='string') invalid(`dano de ${path}`);}
    else if(path==='system.attributes.dodge.-=gcs_imported_fixed') {if(value!==null) invalid('remoção da esquiva importada');}
    else invalid(`caminho ${path}`);
  }
  const keys=new Set();
  for(const item of plan.items) {
    if(!object(item)||!TEMPLATE_ITEM_TYPES.has(item.type)||!id(item.name)||!object(item.system)||item._id!==undefined||item.id!==undefined) invalid('item do plano');
    const gum=item.flags?.gum;
    if(gum?.templateApplicationId!==applicationId||!id(gum.templateEntryKey)||keys.has(gum.templateEntryKey)) invalid('proveniência do item');
    keys.add(gum.templateEntryKey);
  }
  if(plan.records.filter(r=>r.applicationId===applicationId).length!==1) invalid('registro da aplicação');
  if(!Array.isArray(plan.baseline.records)||!object(plan.baseline.attributes)||!object(plan.baseline.points)) invalid('base do plano');
}

export function validateTemplateJournal(record) {
  if(!object(record)||!id(record.applicationId)||!id(record.operationId)) invalid('identidade da operação');
  if(record.state==='applying'||record.phase==='rollback') {
    if(!['create','rollback'].includes(record.phase)) invalid('fase da aplicação');
    validateTemplateStoredPlan(record.plan,record.applicationId);
    if(record.operationId!==record.applicationId) invalid('operação de aplicação');
    if(!Array.isArray(record.createdItems)) invalid('itens criados');
    for(const item of record.createdItems) if(!id(item.id)||!(item.projection===null||object(item.projection))) invalid('registro de criação');
    if(record.rollbackItemIds!==undefined&&(!Array.isArray(record.rollbackItemIds)||!record.rollbackItemIds.every(id))) invalid('itens de recuperação');
  } else if(record.state==='removing') {
    if(record.operationId!==`${record.applicationId}:remove`||!['delete','unlink'].includes(record.phase)||!object(record.removal)) invalid('fase da remoção');
    for(const key of ['deleteIds','unlinkIds']) if(!Array.isArray(record.removal[key])||!record.removal[key].every(id)) invalid('itens da remoção');
  } else invalid('estado pendente desconhecido');
}
