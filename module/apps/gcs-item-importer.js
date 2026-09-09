import {planGCSItemImport, GCS_IMPORT_LIMITS} from '../utils/gcs-item-import-plan.mjs';
import {escapeGCSHTML as esc} from '../utils/gcs-item-import-conversion.mjs';
import {GCSItemImportService} from '../services/gcs-item-import-service.mjs';
import {parseGCSLibraryTrait,parseGCSLibrarySkill,parseGCSLibrarySpell,parseGCSLibraryModifier,parseGCSLibraryEquipment,parseGCSLibraryEquipmentModifier} from './importers.js';
const adapters={adq:parseGCSLibraryTrait,skl:parseGCSLibrarySkill,spl:parseGCSLibrarySpell,adm:parseGCSLibraryModifier,eqp:parseGCSLibraryEquipment,eqm:parseGCSLibraryEquipmentModifier};
let open=false;
const typeLabels={template:'Modelo',advantage:'Vantagem',disadvantage:'Desvantagem',skill:'Perícia / Técnica',spell:'Magia',equipment:'Equipamento',modifier:'Modificador',eqp_modifier:'Modificador de equipamento'};
const wrapper=body=>`<div class="gum-gcs-item-import" style="max-height:65vh;overflow:auto;overflow-wrap:anywhere">${body}</div>`;
function warningsHTML(warnings) {
  if(!warnings.length)return '';
  return `<details><summary>${warnings.length} aviso(s) para revisão</summary><ul>${warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></details>`;
}
export function renderGCSImportPreview(plan) {
  return wrapper(`<p>Os itens serão criados diretamente na aba Itens, sem criar pastas. Nenhum ator será importado. Itens existentes não serão sobrescritos.</p>${plan.files.map(f=>`<section style="margin:1em 0"><strong>${esc(f.name)}</strong>${f.error?`<p role="alert">${esc(f.error)}</p>`:`<p>${f.drafts.length} item(ns): ${esc([...new Set(f.drafts.map(d=>typeLabels[d.type]??d.type))].join(', '))}</p><details><summary>Conferir itens</summary><ul>${f.drafts.map(d=>`<li>${esc(d.name)} (${esc(typeLabels[d.type]??d.type)})${d.system.points!==undefined?` — ${esc(d.system.points)} pontos`:''}</li>`).join('')}</ul></details>${warningsHTML(f.warnings)}`}</section>`).join('')}`);
}
function confirmPlan(plan) {
  return new Promise(resolve=>{
    let answered=false;
    const finish=value=>{if(!answered){answered=true;resolve(value);}};
    new Dialog({title:'Importar do GCS — conferir',content:renderGCSImportPreview(plan),buttons:{
      ...(plan.files.some(f=>f.drafts.length)?{import:{label:'Importar válidos',icon:'<i class="fas fa-file-import"></i>',callback:()=>finish(true)}}:{}),
      cancel:{label:'Cancelar',callback:()=>finish(false)}
    },default:'cancel',close:()=>finish(false)},{width:640}).render(true);
  });
}
function selectFiles() {
  return new Promise(resolve=>{
    const input=document.createElement('input');input.type='file';input.multiple=true;
    input.accept='.gct,.adq,.adm,.skl,.spl,.eqp,.eqm,.json,.gcs';
    input.addEventListener('change',()=>resolve([...input.files]),{once:true});
    input.addEventListener('cancel',()=>resolve([]),{once:true});input.click();
  });
}
export async function importGCSItems() {
  if(!game.user?.isGM)return ui.notifications.warn('Somente o Mestre pode importar itens');
  if(open)return ui.notifications.info('Já existe uma importação aberta');
  open=true;
  try {
    const files=await selectFiles();if(!files.length)return;
    if(files.length>GCS_IMPORT_LIMITS.files)throw new Error('Selecione no máximo 100 arquivos');
    ui.notifications.info('Analisando arquivos GCS…');
    const plan=await planGCSItemImport(files,adapters);
    if(!await confirmPlan(plan))return;
    const service=new GCSItemImportService({
      isGM:()=>Boolean(game.user?.isGM),
      listItems:async()=>[...game.items.contents],
      createItem:data=>Item.create(data,{renderSheet:false})
    });
    ui.notifications.info('Importando itens GCS…');let progressCount=0;
    const result=await service.execute(plan,{confirmed:true,onProgress:r=>{if(r.created+r.failed>=progressCount+25){progressCount=r.created+r.failed;ui.notifications.info(`Importação GCS: ${progressCount} processado(s)`);}}});
    new Dialog({title:'Importação GCS — resultado',content:wrapper(`<p>${result.created} criado(s), ${result.skipped} já importado(s), ${result.failed} falha(s), ${result.invalid} arquivo(s) inválido(s).</p>${result.interrupted?'<p role="alert">Importação interrompida por resposta incerta. Confira os itens antes de repetir.</p>':''}${result.files.map(f=>`<section><strong>${esc(f.name)}</strong><p>${f.created} criado(s), ${f.skipped} já importado(s), ${f.failed} falha(s)</p>${f.errors.map(e=>`<p role="alert">${esc(e)}</p>`).join('')}${warningsHTML(f.warnings)}</section>`).join('')}<p>Os conteúdos estão na aba Itens. Revise as pendências antes de aplicar modelos; você pode organizar seus compêndios pelas ferramentas normais do Foundry.</p>`),buttons:{ok:{label:'Fechar'}}},{width:640}).render(true);
  }catch(error){ui.notifications.error(`Importação GCS: ${error.message}`);}finally{open=false;}
}
export function addGCSItemImportButton(app,html) {
  if(!game.user?.isGM)return;
  const root=html instanceof HTMLElement?html:html?.[0];
  if(!root||root.querySelector('.gum-gcs-item-import-button'))return;
  const host=root.querySelector('.directory-header .header-actions')??root.querySelector('.directory-header');
  if(!host)return;
  const button=document.createElement('button');button.type='button';button.className='gum-gcs-item-import-button';
  button.style.cssText='width:100%;margin-bottom:5px';button.textContent='Importar do GCS';
  button.addEventListener('click',()=>importGCSItems());host.append(button);
}
