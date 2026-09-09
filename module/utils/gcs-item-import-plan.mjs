import {convertGCSContent, gcsDecimal, GCS_CONVERTER_VERSION, canonicalGCS} from './gcs-item-import-conversion.mjs';
import {validateTemplateBlocks} from './template-application-plan.mjs';
export const GCS_IMPORT_LIMITS={bytes:16*1024*1024,files:100,depth:30,nodes:100000,items:10000};
const families={t:'adq',m:'adm',s:'skl',q:'skl',p:'spl',r:'spl',e:'eqp',f:'eqm'};
export function validateGCSData(data,{depth:depthLimit=GCS_IMPORT_LIMITS.depth,nodes:nodeLimit=GCS_IMPORT_LIMITS.nodes}={}) {
  let count=0;
  function walk(value,depth) {
    if(depth>depthLimit||++count>nodeLimit)throw new Error('Arquivo excede limite de profundidade ou entradas');
    if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Número não finito');
    if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)) {
      if(['__proto__','prototype','constructor'].includes(key)||key.includes('.')||key.startsWith('-='))throw new Error('Chave de dados inválida');
      walk(child,depth+1);
    }
  }walk(data,0);
}
export function validateGCSDraft(draft) {
  // An input group expands into block/entry/inline layers. Use one output
  // contract both before confirmation and immediately before persistence.
  validateGCSData(draft,{depth:100,nodes:500000});
  const types=['template','advantage','disadvantage','skill','spell','equipment','modifier','eqp_modifier'];
  if(!types.includes(draft.type)||typeof draft.name!=='string'||!draft.system||Object.keys(draft).some(k=>!['name','type','system','flags','effects','img'].includes(k))||draft.effects?.length)throw new Error('Documento de importação não permitido');
  const p=draft.flags?.gum?.gcsImport;
  if(!p||p.converter!==GCS_CONVERTER_VERSION||p.signature!==canonicalGCS({family:p.family,source:p.source,path:p.path??[]}))throw new Error('Plano de importação inválido');
  if(draft.type==='template')validateTemplateBlocks(draft.system.blocks);
}
export function classifyGCSContent(data,filename) {
  validateGCSData(data);
  const ext=String(filename).split('.').pop().toLowerCase();
  if(ext==='gcs'||data?.profile||data?.settings||data?.attributes||data?.points_record||data?.total_points!==undefined)throw new Error('Ficha de personagem: use o importador da aba Atores.');
  if(!data||Array.isArray(data)||typeof data!=='object')throw new Error('Formato GCS não reconhecido');
  if(data.version!==5)throw new Error(`Versão GCS não suportada: ${data.version??'ausente'} (esperada: 5)`);
  const templateKeys=['traits','skills','spells','equipment','other_equipment'];
  const hasTemplate=templateKeys.some(k=>Array.isArray(data[k]));
  let kind=ext;
  if(ext==='json') {
    if(hasTemplate&&!data.rows)kind='gct';
    else if(Array.isArray(data.rows)) {
      const found=new Set(data.rows.map(r=>families[String(r?.id??'')[0]?.toLowerCase()]).filter(Boolean));
      if(found.size===1)kind=[...found][0];
    }
  }
  if(!['gct','adq','adm','skl','spl','eqp','eqm'].includes(kind))throw new Error('Formato sem tipo de Item correspondente no GUM');
  if(kind==='gct') {
    if(!hasTemplate||data.rows)throw new Error('Conflito entre extensão de template e conteúdo');
    for(const key of templateKeys)if(data[key]!==undefined&&!Array.isArray(data[key]))throw new Error(`Coleção inválida: ${key}`);
  } else if(!Array.isArray(data.rows)||hasTemplate)throw new Error('Conflito entre extensão de biblioteca e conteúdo');
  function checkRows(rows,expected) {
    for(const row of rows) {
      if(!row||Array.isArray(row)||typeof row!=='object')throw new Error('Entrada GCS inválida');
      const actual=families[String(row.id??'')[0]?.toLowerCase()];
      if(actual&&actual!==expected)throw new Error('Conflito entre família da entrada e extensão');
      const fields={adq:['base_points','points_per_level','modifiers','container_type'],adm:['cost_adj','cost_type'],skl:['difficulty','default','defaults'],spl:['college','spell_class','casting_cost','ritual_skill_name'],eqp:['description','value','base_value','weight','base_weight'],eqm:['cost_type','weight_type']}[expected];
      if(!actual&&!row.children&&!fields.some(k=>row[k]!==undefined))throw new Error('Família da entrada não identificada pela estrutura');
      if(typeof(row.name??row.description)!=='string')throw new Error('Entrada sem nome/descrição');
      for(const k of ['points','base_points','points_per_level','levels','quantity','value','base_value'])if(row[k]!==undefined&&(['value','base_value'].includes(k)?gcsDecimal(row[k])===undefined:(typeof row[k]!=='number'||!Number.isFinite(row[k]))))throw new Error(`Número inválido: ${k}`);
      if(row.quantity!==undefined&&row.quantity<0)throw new Error('Quantidade negativa');
      for(const k of ['modifiers','features','weapons','defaults','tags'])if(row[k]!==undefined&&!Array.isArray(row[k]))throw new Error(`Lista inválida: ${k}`);
      if(row.children!==undefined){if(!Array.isArray(row.children))throw new Error('Filhos inválidos');checkRows(row.children,expected);}
    }
  }
  if(kind==='gct')for(const [key,f]of Object.entries({traits:'adq',skills:'skl',spells:'spl',equipment:'eqp',other_equipment:'eqp'}))checkRows(data[key]??[],f);
  else checkRows(data.rows,kind);
  return {kind,diagnostics:[]};
}
export async function planGCSItemImport(files,adapters={}) {
  if(files.length>GCS_IMPORT_LIMITS.files)throw new Error('Selecione no máximo 100 arquivos por importação');
  const result={files:[]};
  for(const file of files) {
    const entry={name:String(file.name),drafts:[],warnings:[]};result.files.push(entry);
    try {
      if(file.size>GCS_IMPORT_LIMITS.bytes)throw new Error('Arquivo excede 16 MB');
      const text=typeof file.text==='function'?await file.text():file.text;
      if(typeof text!=='string'||new TextEncoder().encode(text).length>GCS_IMPORT_LIMITS.bytes)throw new Error('Arquivo inválido ou excede 16 MB');
      let data;try{data=JSON.parse(text);}catch{throw new Error('JSON inválido: não foi possível ler o arquivo');}
      const {kind}=classifyGCSContent(data,file.name);entry.kind=kind;
      Object.assign(entry,convertGCSContent(data,kind,file.name,adapters));
      entry.drafts.forEach(validateGCSDraft);
      if(entry.drafts.length>GCS_IMPORT_LIMITS.items)throw new Error('Biblioteca excede 10000 itens');
      if(!entry.drafts.length)throw new Error('Arquivo sem itens importáveis');
    }catch(error){entry.drafts=[];entry.error=error.message;}
  }
  return result;
}
