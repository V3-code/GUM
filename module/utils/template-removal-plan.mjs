import {cloneTemplateData,templateRecordActive,templateCell,templateEqual,templateWrite,templateItemProjection} from './template-application-plan.mjs';

export function buildTemplateRemovalPlan(source,applicationId,items=[]) {
  const records=cloneTemplateData(source.system?.applied_models||[]);
  const record=records.find(r=>r.applicationId===applicationId&&templateRecordActive(r));
  if(!record) throw new Error('Modelo não encontrado ou já removido');
  const updateData={},warnings=[],deleteIds=[],unlinkIds=[];
  const fields=record.fields||[];
  if(record.schemaVersion!==2) {
    warnings.push('Registro antigo: secundários e itens sem prova de integridade serão preservados.');
    for(const change of record.attributeChanges||[]) {
      if(!['st','dx','iq','ht','vont','per','hp','fp','basic_speed','basic_move'].includes(change.key)) continue;
      const path=`system.attributes.${change.key}.value`, current=templateCell(source,path);
      if(current.exists&&Number.isFinite(Number(current.value))&&Number.isFinite(Number(change.amount))) updateData[path]=(updateData[path]??Number(current.value))-Number(change.amount);
    }
    if(record.pointsLeftover) fields.push({path:'system.points.unspent',explicit:Number(record.pointsLeftover),numeric:true,detached:true});
  }
  for(const field of fields) {
    if(!/^system\.(points\.unspent|attributes\.((st|dx|iq|ht|vont|per|lifting_st|vision|hearing|tastesmell|touch|basic_speed|basic_move|dodge)\.value|(hp|fp)\.(max|value)|dodge\.gcs_imported_fixed|thrust_damage|swing_damage))$/.test(field.path)) throw new Error(`Caminho de modelo inválido: ${field.path}`);
    if(!Number.isFinite(Number(field.explicit||0)) || (field.numeric&&!field.detached&&!Number.isFinite(field.delta))) throw new Error(`Contribuição inválida: ${field.path}`);
    const current=templateCell(source,field.path);
    const others=records.filter(r=>r!==record&&templateRecordActive(r)).flatMap(r=>r.fields||[]).filter(f=>f.path===field.path&&f.lineage===field.lineage);
    const intact=!field.detached && templateEqual(current,field.expected);
    let next=current;
    if(field.numeric) {
      let delta=intact?field.delta:field.explicit;
      if(!current.exists || !Number.isFinite(Number(current.value))) {warnings.push(`${field.path}: valor alterado preservado`);delta=0;}
      if(field.path==='system.points.unspent' && Number(current.value)-delta<0) {warnings.push('Saldo de pontos já utilizado: preservado.');delta=0;}
      if(delta) next={exists:true,value:Number(current.value)-delta};
      // Preserve absence when the final intact numeric contribution is removed.
      if(intact&&!others.length&&!field.base?.exists && next.value===0) next={exists:false};
    } else if(intact) next=others.filter(f=>!f.detached).at(-1)?.after||field.base;
    if(!intact && field.lineage) {
      warnings.push(`${field.path}: edição posterior preservada`);
      for(const other of others) other.detached=true;
    }
    for(const other of others) other.expected=next;
    // Removing an explicit delta can legitimately shift a newer lineage started after a manual edit.
    for(const r of records.filter(r=>r!==record&&templateRecordActive(r))) for(const other of r.fields||[]) {
      if(other.path===field.path&&other.lineage!==field.lineage&&!other.detached&&templateEqual(other.expected,current)) other.expected=next;
    }
    if(!templateEqual(current,next)) templateWrite(updateData,field.path,next);
  }
  const saved=new Map((record.createdItems||[]).map(i=>[i.id,i]));
  for(const id of new Set([...(record.createdItemIds||[]),...saved.keys()])) {
    const item=items.find(i=>(i._id||i.id)===id);
    if(!item) continue;
    if(item.flags?.gum?.templateApplicationId!==applicationId) {warnings.push(`${item.name||id}: propriedade não comprovada; preservado`);continue;}
    if(saved.has(id)&&templateEqual(templateItemProjection(item),saved.get(id).projection)) deleteIds.push(id);
    else {unlinkIds.push(id);warnings.push(`${item.name||id}: item editado ou legado preservado`);}
  }
  record.state='removed';record.removedAt='pending';
  return {updateData,records,deleteIds,unlinkIds,warnings};
}
