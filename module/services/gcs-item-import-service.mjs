import {GCS_CONVERTER_VERSION} from '../utils/gcs-item-import-conversion.mjs';
import {validateGCSDraft} from '../utils/gcs-item-import-plan.mjs';
let importing=false;
const provenance=item=>item.flags?.gum?.gcsImport;
const same=(a,b)=>a?.converter===GCS_CONVERTER_VERSION && a.signature===b.signature && a.family===b.family;
export class GCSItemImportService {
  constructor(ports){this.p=ports;}
  async execute(plan,{confirmed=false,onProgress=()=>{}}={}) {
    const result={created:0,skipped:0,failed:0,invalid:0,files:[]};
    if(!confirmed)return {...result,cancelled:true};
    if(importing)throw new Error('Uma importação já está em andamento');
    const requireGM=()=>{if(!this.p.isGM())throw new Error('Somente o Mestre pode importar itens');};
    requireGM();importing=true;
    try {
      this.p.validateDestination?.();
      let existing=await this.p.listItems();
      for(const file of plan.files) {
        const report={name:file.name,created:0,skipped:0,failed:0,errors:file.error?[file.error]:[],warnings:file.warnings??[]};result.files.push(report);
        if(file.error){result.invalid++;continue;}
        try{file.drafts.forEach(validateGCSDraft);}catch(error){report.errors.push(error.message);result.invalid++;continue;}
        for(const draft of file.drafts) {
          try{requireGM();this.p.validateDestination?.();}catch(error){
            report.errors.push(error.message);result.interrupted=true;return result;
          }
          const p=provenance(draft);
          if(existing.some(item=>same(provenance(item),p))){report.skipped++;result.skipped++;continue;}
          if(p.source?.id&&existing.some(item=>provenance(item)?.source?.id===p.source.id&&provenance(item)?.family===p.family))report.warnings=[...report.warnings,`${draft.name}: nova variante da origem; o item anterior será preservado.`];
          try {
            requireGM();const item=await this.p.createItem(structuredClone(draft));
            existing=[...existing,item];report.created++;result.created++;
          }catch(error) {
            // A server response may be lost after persistence. Never retry blindly.
            let found=false;
            try{existing=await this.p.listItems();found=existing.some(item=>same(provenance(item),p));}catch{
              report.failed++;result.failed++;report.errors.push(`${draft.name}: resposta incerta e coleção indisponível. Importação interrompida; confira os itens antes de repetir.`);
              result.interrupted=true;return result;
            }
            if(found){report.created++;result.created++;}
            else {report.failed++;result.failed++;report.errors.push(`${draft.name}: ${error.message}`);}
          }
          onProgress({...result,current:file.name});
        }
      }
      return result;
    }finally{importing=false;}
  }
}
