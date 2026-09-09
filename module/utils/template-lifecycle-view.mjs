import {templatePending,templateRecordActive} from './template-application-plan.mjs';
export const escapeTemplateText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function templateModelView(records=[]) {
  const blocked=records.some(templatePending);
  return {blocked,models:records.filter(templateRecordActive).map(r=>({...r,pending:templatePending(r),blocked,
    stateLabel:({applying:'Aplicação pendente',removing:'Remoção pendente','recovery-required':'Recuperação pendente'})[r.state]||'',
    appliedAtLabel:r.appliedAt?new Date(r.appliedAt).toLocaleString():'-'}))};
}
export function renderTemplateLifecyclePreview({updateData={},deleteIds=[],unlinkIds=[],warnings=[],itemLabels={}}) {
  const list=values=>`<ul>${values.map(value=>`<li>${escapeTemplateText(value)}</li>`).join('')}</ul>`;
  const labels={st:'ST',dx:'DX',iq:'IQ',ht:'HT',vont:'Vontade',per:'Percepção',hp:'PV',fp:'PF',lifting_st:'ST de levantamento',vision:'Visão',hearing:'Audição',tastesmell:'Paladar/olfato',touch:'Tato',basic_speed:'Velocidade básica',basic_move:'Deslocamento',dodge:'Esquiva',thrust_damage:'Dano de ponta',swing_damage:'Dano de balanço'};
  const label=path=>{
    if(path==='system.points.unspent') return 'Pontos livres';
    const parts=path.split('.');
    if(parts[0]==='system'&&parts[1]==='attributes'&&labels[parts[2]]) return labels[parts[2]]+(parts[3]==='max'?' máximo':parts[3]?.includes('gcs_imported_fixed')?' fixada pela importação':'');
    return path;
  };
  return '<p>Ao remover, os bônus explícitos do modelo serão descontados do valor atual, mesmo após edição manual. Nos campos recalculados, retiramos somente a alteração registrada; edições posteriores identificadas são preservadas. Nos modelos novos, PV e PF atuais permanecem iguais.</p>'+
    list(Object.entries(updateData).map(([path,value])=>`${label(path)}: ${path.includes('.-=')?'retirar valor fixo':value}`))+
    `<p>Itens a remover: ${deleteIds.length}. Itens preservados: ${unlinkIds.length}.</p>`+list(deleteIds.map(id=>itemLabels[id]||id))+list(unlinkIds.map(id=>itemLabels[id]||id))+list(warnings);
}
export function isTemplateProvenanceUpdate(changes) {
  const allowed=new Set(['templateApplicationId','templateApplied','templateEntryKey']);let found=false;
  const visit=(object,prefix='')=>Object.entries(object||{}).every(([key,value])=>{
    const path=prefix?`${prefix}.${key}`:key;
    if(path==='_id') return true;
    const match=path.match(/^flags\.gum\.(-=)?([^.]+)$/);
    if(match&&allowed.has(match[2])) {found=true;return true;}
    if(['flags','flags.gum'].includes(path)&&value&&typeof value==='object'&&!Array.isArray(value))return visit(value,path);
    return false;
  });
  return visit(changes)&&found;
}
