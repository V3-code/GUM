import {cloneTemplateData,templateEqual,templateSnapshot,templatePending,templateItemProjection} from '../utils/template-application-plan.mjs';
import {buildTemplateRemovalPlan} from '../utils/template-removal-plan.mjs';
import {validateTemplateStoredPlan,validateTemplateJournal,TemplateJournalValidationError,serializeTemplateStoredPlan,templateStoredUpdates} from '../utils/template-journal-validation.mjs';

const locks=new Set();
const terminal=r=>['active','removed','rolled-back'].includes(r?.state);
const recordsOf=source=>source.system?.applied_models||[];
const owned=(item,id)=>item.flags?.gum?.templateApplicationId===id;
const itemId=item=>item._id||item.id;

// Ports deliberately expose source documents, not prepared actor/item data.
export class TemplateApplicationService {
  constructor(ports) {this.p=ports;}
  async locked(action) {
    if(locks.has(this.p.key)) throw new Error('Operação de modelo em andamento.');
    locks.add(this.p.key);try{return await action();}finally{locks.delete(this.p.key);}
  }
  async save(record,patch={}) {
    const {source}=await this.p.read();
    const records=cloneTemplateData(recordsOf(source));
    const index=records.findIndex(r=>r.applicationId===record.applicationId);
    if(index<0) records.push(record);else records[index]=record;
    await this.p.update({...patch,'system.applied_models':records});
  }
  result(record) {return {status:record.state,warnings:record.warnings||[],applicationId:record.applicationId};}
  async apply(plan) {
    return this.locked(async()=>{
      validateTemplateStoredPlan(plan,plan?.record?.applicationId);
      const {source}=await this.p.read();
      if(recordsOf(source).some(templatePending)) throw new Error('Há operação pendente. Use Retomar.');
      if(!templateEqual(templateSnapshot(source),plan.baseline)) throw new Error('A ficha mudou. Abra novamente a aplicação do modelo.');
      const record={...cloneTemplateData(plan.record),state:'applying',phase:'create',plan:serializeTemplateStoredPlan(plan),appliedAt:this.p.now(),warnings:[]};
      try {await this.save(record);return await this.run(record.applicationId);}
      catch(error) {return this.reconcile(record.applicationId,error,record.operationId);}
    });
  }
  async previewRemoval(id) {
    const {source,items}=await this.p.read();
    if(recordsOf(source).some(templatePending)) throw new Error('Há operação pendente. Use Retomar.');
    return {...buildTemplateRemovalPlan(source,id,items),baseline:templateSnapshot(source),itemBaseline:items.map(templateItemProjection),itemLabels:Object.fromEntries(items.map(item=>[itemId(item),item.name]))};
  }
  async remove(id,preview=null) {
    return this.locked(async()=>{
      const {source,items}=await this.p.read();
      if(recordsOf(source).some(templatePending)) throw new Error('Há operação pendente. Use Retomar.');
      if(preview&&(!templateEqual(templateSnapshot(source),preview.baseline)||!templateEqual(items.map(templateItemProjection),preview.itemBaseline))) throw new Error('A ficha mudou. Revise novamente a remoção.');
      const plan=buildTemplateRemovalPlan(source,id,items);
      const record={...cloneTemplateData(recordsOf(source).find(r=>r.applicationId===id)),operationId:`${id}:remove`,state:'removing',phase:'delete',removal:{deleteIds:plan.deleteIds,unlinkIds:plan.unlinkIds},warnings:plan.warnings};
      try {await this.save(record);return await this.run(id);}
      catch(error) {return this.reconcile(id,error,record.operationId);}
    });
  }
  async resume(id) {
    return this.locked(async()=>{
      try{return await this.run(id);}catch(error){return this.reconcile(id,error);}
    });
  }
  async reconcile(id,error,expectedOperationId) {
    if(error instanceof TemplateJournalValidationError) throw error;
    // A rejected response can follow a successful commit. Read before doing anything.
    let state;
    try {state=await this.p.read();} catch {return {status:'pending',applicationId:id,error:'Não foi possível verificar a gravação. Reabra a ficha e use Retomar.'};}
    const record=recordsOf(state.source).find(r=>r.applicationId===id);
    if(record&&expectedOperationId&&record.operationId!==expectedOperationId) throw error;
    if(terminal(record)) return this.result(record);
    if(!record) throw error; // Initial journal was not committed; no child writes began.
    validateTemplateJournal(record);
    if(record.state==='applying') {
      try {
        await this.save({...record,state:'recovery-required',phase:'rollback',warnings:[...(record.warnings||[]),String(error.message||error)]});
        return await this.run(id);
      } catch {
        try {const {source}=await this.p.read();const r=recordsOf(source).find(r=>r.applicationId===id);if(terminal(r))return this.result(r);}catch{/* Keep uncertainty visible. */}
      }
    }
    return {status:'pending',applicationId:id,error:String(error.message||error)};
  }
  async run(id) {
    let {source,items}=await this.p.read();
    let record=cloneTemplateData(recordsOf(source).find(r=>r.applicationId===id));
    if(!record) throw new Error('Operação de modelo não encontrada.');
    if(terminal(record)) return this.result(record);
    validateTemplateJournal(record);
    if(record.phase==='rollback') {
      if(!record.rollbackItemIds) {
        record.rollbackItemIds=items.filter(i=>owned(i,id)).map(itemId);
        await this.save(record);
      }
      for(const targetId of record.rollbackItemIds) {
        ({items}=await this.p.read());
        const item=items.find(i=>itemId(i)===targetId);
        if(!item) {await this.p.delete(targetId);continue;}
        if(!owned(item,id)) continue;
        const saved=record.createdItems?.find(i=>i.id===itemId(item));
        const original=record.plan.items.find(i=>i.flags.gum.templateEntryKey===item.flags.gum.templateEntryKey);
        // A lost create response has no saved projection. Compare authored payload as a subset.
        const equal=saved?templateEqual(templateItemProjection(item),saved.projection):original&&this.payloadMatches(original,item);
        if(equal) await this.p.delete(itemId(item));
        else {await this.p.unlink(itemId(item));record.warnings.push(`${item.name}: item alterado preservado durante recuperação.`);}
      }
      record.state='rolled-back';record.removedAt=this.p.now();delete record.plan;
      await this.save(record);return this.result(record);
    }
    if(record.state==='applying') {
      for(const payload of record.plan.items) {
        ({source,items}=await this.p.read());
        const existing=items.filter(i=>owned(i,id)&&i.flags.gum.templateEntryKey===payload.flags.gum.templateEntryKey);
        if(existing.length>1) throw new Error('Mais de um item para a mesma entrada; recuperação requer revisão.');
        if(existing[0]&&!record.createdItems?.some(i=>i.id===itemId(existing[0]))) {
          throw new Error('Criação reencontrada sem confirmação dos efeitos. A aplicação será desfeita conservadoramente.');
        }
        const item=existing[0]||await this.p.create(payload);
        record.createdItems??=[];
        if(!record.createdItems.some(i=>i.id===itemId(item))) {
          record.createdItems.push({id:itemId(item),projection:templateItemProjection(item)});
          record.createdItemIds=record.createdItems.map(i=>i.id);
          await this.save(record);
        }
      }
      ({source}=await this.p.read());
      const baseline=templateSnapshot(source);baseline.records=baseline.records.filter(r=>r.applicationId!==id);
      if(!templateEqual(baseline,record.plan.baseline)) throw new Error('Dados da ficha mudaram durante aplicação.');
      const finalRecords=cloneTemplateData(record.plan.records);
      const active={...record,state:'active'};delete active.plan;delete active.phase;
      finalRecords[finalRecords.findIndex(r=>r.applicationId===id)]=active;
      await this.p.update({...templateStoredUpdates(record.plan),'system.applied_models':finalRecords});
      return this.result(active);
    }
    if(record.phase==='delete') {
      for(const targetId of record.removal.deleteIds) {
        ({items}=await this.p.read());const item=items.find(i=>itemId(i)===targetId);
        if(!item) {await this.p.delete(targetId);continue;}
        if(!owned(item,id)) continue;
        const saved=record.createdItems?.find(i=>i.id===targetId);
        if(saved&&templateEqual(templateItemProjection(item),saved.projection)) await this.p.delete(targetId);
        else {record.removal.unlinkIds.push(targetId);record.warnings.push(`${item.name}: edição posterior preservada.`);await this.save(record);}
      }
      // Replan fields against current values, but retain the approved item decisions.
      ({source,items}=await this.p.read());
      const latest=buildTemplateRemovalPlan(source,id,items);
      record.warnings=[...new Set([...record.warnings,...latest.warnings])];
      record.phase='unlink';
      const nextRecords=latest.records;
      nextRecords[nextRecords.findIndex(r=>r.applicationId===id)]=record;
      await this.p.update({...latest.updateData,'system.applied_models':nextRecords});
    }
    // Attribute checkpoint above is committed atomically with the changes. Resume skips it.
    if(record.phase==='unlink') {
      for(const targetId of new Set(record.removal.unlinkIds)) {
        ({items}=await this.p.read());const item=items.find(i=>itemId(i)===targetId);
        if(item&&owned(item,id)) await this.p.unlink(targetId);
      }
      record.state='removed';record.removedAt=this.p.now();delete record.removal;delete record.phase;
      await this.save(record);return this.result(record);
    }
    throw new Error('Estado de recuperação desconhecido.');
  }
  payloadMatches(payload,item) {
    const subset=(a,b)=>a&&typeof a==='object'?Object.entries(a).every(([k,v])=>subset(v,b?.[k])):templateEqual(a,b);
    const authored=templateItemProjection(payload);
    if(payload.img===undefined) delete authored.img;
    return subset(authored,templateItemProjection(item));
  }
}
