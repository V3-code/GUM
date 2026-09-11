// GCS data is never executable. These converters create source Items, not effects.
export const GCS_CONVERTER_VERSION = 1;
export const escapeGCSHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function canonicalGCS(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalGCS).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalGCS(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function gcsImportSignature(provenance) {
  return canonicalGCS({family:provenance.family,source:provenance.source,path:provenance.path??[],
    ...(provenance.modelStructureRevision!==undefined?{modelStructureRevision:provenance.modelStructureRevision}:{})});
}
// Full canonical source is compared as well as the short key: collisions cannot merge Items.
export function gcsKey(value) {
  let hash=2166136261; for(const c of canonicalGCS(value)) hash=Math.imul(hash^c.charCodeAt(0),16777619);
  return (hash>>>0).toString(16).padStart(8,'0');
}
const number = value => typeof value==='number' && Number.isFinite(value) ? value : undefined;
export const gcsDecimal = value => (typeof value==='number'||(typeof value==='string'&&/^[+-]?\d+(?:\.\d+)?$/.test(value.trim())))&&Number.isFinite(Number(value)) ? Number(value) : undefined;
export function traitCost(node) {
  if (number(node.calc?.points)!==undefined) return {points:node.calc.points,known:true};
  if (node.children?.length) {
    const children=node.children.map(traitCost);
    if (!node.template_picker && (!node.container_type || node.container_type==='meta_trait')) return {points:children.reduce((n,c)=>n+c.points,0),known:children.every(c=>c.known)};
    return {points:0,known:false};
  }
  let base=number(node.base_points)??number(node.points)??0;
  const perLevel=number(node.points_per_level)??0;
  if(perLevel && number(node.levels)===undefined) return {points:base,known:false};
  base+=perLevel*(number(node.levels)??0);
  let percent=0,flat=0,known=true;
  const mods=items=>{for(const m of items??[]) {if(m.disabled)continue;if(m.children?.length){mods(m.children);continue;}
    const raw=String(m.cost_adj??'').trim();const match=raw.match(/^([+-]?\d+(?:\.\d+)?)(%)?$/);
    if(!match || m.affects || m.use_level_from_trait) {known=false;continue;}
    const amount=Number(match[1])*(number(m.levels)??1);if(match[2])percent+=amount;else flat+=amount;
  }};
  mods(node.modifiers);
  if(node.cr || node.cr_adj || node.use_level_from_trait || node.round_down) known=false;
  const points=Math.ceil((base+flat)*(1+Math.max(-80,percent)/100));
  return {points:Number.isFinite(points)?points:0,known};
}
const families={adq:'advantage',adm:'modifier',skl:'skill',spl:'spell',eqp:'equipment',eqm:'eqp_modifier'};
const labels={adq:'Características',skl:'Perícias',spl:'Magias',eqp:'Equipamentos'};
function sourceNotes(node) {
  return [node.local_notes,node.notes,node.userdesc,node.vtt_notes].filter(x=>typeof x==='string'&&x).join('\n\n');
}
function readable(value) {
  if(Array.isArray(value)) return value.map(readable).join('; ');
  if(value&&typeof value==='object') return Object.entries(value).map(([k,v])=>`${k}: ${readable(v)}`).join(', ');
  return String(value??'');
}
export function convertGCSContent(data,kind,filename,adapters={}) {
  const warnings=[],drafts=[];let serial=0;
  const id=()=>`gcs${++serial}`;
  const warn=message=>{if(!warnings.includes(message))warnings.push(message);};
  function item(node,family,path=[]) {
    const name=String(node.name||node.description||'Sem nome');
    const cost=family==='adq'?traitCost(node):{points:number(node.points)??0,known:true};
    const normalized=structuredClone(node);
    if(family==='eqp')normalized.description??=name;
    // Containers are handled by the planner, never recursively by a row adapter.
    delete normalized.children;
    if(family==='adq'){normalized.calc={...(normalized.calc??{}),points:cost.points};normalized.modifiers=[];}
    if(family==='adm' && !normalized.cost_adj && normalized.cost!==undefined) {
      normalized.cost_adj=String(normalized.cost)+(normalized.cost_type==='percentage'?'%':'');
    }
    // Legacy adapters map only data fields. No world lookup or name-based automation.
    const mapped=adapters[family]?.(normalized);
    const result=mapped??{name,type:family==='adq'&&cost.points<0?'disadvantage':families[family],system:{}};
    if(!result || !families[family])throw new Error(`${name}: família não suportada`);
    result.name=name;
    if(family==='adq'&&cost.points===0&&node.tags?.includes('Disadvantage'))result.type='disadvantage';
    result.effects=[];result.flags={gum:{gcsImport:{converter:GCS_CONVERTER_VERSION,family,source:structuredClone(node),path:[...path]}}};
    const s=result.system??={};s.ref=String(node.reference??'');
    if(['adq','skl','spl'].includes(family))s.points=cost.points;
    if(['skl','spl'].includes(family))s.auto_points=false;
    if(family==='adq') {s.modifiers={};s.level=node.levels??'';s.block_id=cost.points<0?'block3':'block2';}
    if(family==='adm') {s.cost=normalized.cost_adj??'0%';s.level=node.levels??0;}
    if(family==='eqm') {
      // Do not turn every GCS cost stage into a GUM cost factor.
      s.cost_adjustment=String(node.cost??'0');s.cost_factor=0;s.weight_mod='x1';
    }
    if(family==='eqp') {
      s.quantity=node.quantity??1;s.cost=gcsDecimal(node.value)??gcsDecimal(node.base_value)??0;
      const raw=String(node.weight??node.base_weight??'0');const match=raw.match(/^([\d.]+)\s*(lb|lbs|kg)?$/);
      s.weight=match?Number(match[1])*(match[2]?.startsWith('lb')?0.45359237:1):0;
    }
    const details=[];
    if(path.length)details.push(`Grupo: ${path.join(' › ')}`);
    if(!cost.known) {warn(`${name}: custo requer revisão; valor provisório preservado, consulte os dados GCS.`);details.push('PENDÊNCIA: custo requer revisão manual.');}
    for(const key of ['base_points','points_per_level','levels','modifiers','features','prereqs','weapons','default','defaults','limit','replacements','template_picker','container_type','cr','cr_adj','use_level_from_trait','cost','cost_type','weight','weight_type','college','ritual_skill_name','ritual_prereq_count']) {
      if(node[key]!==undefined && (!Array.isArray(node[key])||node[key].length))details.push(`${key}: ${readable(node[key])}`);
    }
    if(node.features?.length || node.prereqs || node.modifiers?.length || node.default || node.defaults?.length>6 || node.limit || node.ritual_skill_name || family==='eqm') {
      warn(`${name}: regras/modificadores preservados na descrição; conferir automação manualmente.`);
      details.unshift('Regras GCS preservadas para revisão. Nenhum efeito automático foi criado; modificadores de características já estão incluídos no custo quando calculável.');
    }
    const additional=Object.fromEntries(Object.entries(node).filter(([k])=>!['id','name','description','local_notes','notes','userdesc','vtt_notes','calc','reference','children'].includes(k)&&!details.some(line=>line.startsWith(`${k}: `))));
    if(Object.keys(additional).length)details.push(`Outros dados GCS: ${readable(additional)}`);
    const text=[sourceNotes(node),...details].filter(Boolean).join('\n\n');
    s.description=`<p>${escapeGCSHTML(text).replace(/\n/g,'<br>')}</p>`;s.chat_description=s.description;
    // Clear any default passive automation. Raw GCS features live only in provenance/description.
    s.effects=[];s.active_effects=[];s.passiveEffects={};s.activationEffects={success:{},failure:{}};s.generalConditions={};s.useEventEffects={};s.onDamageEffects={};
    delete result._id;delete result.ownership;delete result.folder;
    return result;
  }
  function block(nodes,family,title,picker=null) {
    let type='guaranteed',choiceCount=1,pointsAvailable=0;
    if(picker) {
      if(!['count','points'].includes(picker.type))throw new Error(`${title}: tipo de escolha GCS não suportado`);
      const q=picker.qualifier;const compare=q?.compare??'is';const amount=number(q?.qualifier);
      if(!['is','at_most'].includes(compare) || amount===undefined || amount<0 || (picker.type==='count'&&(!Number.isInteger(amount)||amount<1)))throw new Error(`${title}: condição de escolha não representável no GUM`);
      if(compare==='is')warn(`${title}: GCS exige exatamente ${amount}; GUM permite até esse limite. O Mestre deve conferir a seleção exata.`);
      type=picker.type==='count'?'selection':'points';choiceCount=amount;pointsAvailable=amount;
    }
    const hasChoices=node=>Boolean(node.template_picker)||node.children?.some(hasChoices);
    if(type==='points'&&nodes.some(hasChoices))throw new Error(`${title}: pacote com escolhas internas possui custo variável; separe as escolhas antes de importar`);
    return {id:id(),type,title,choiceCount,pointsAvailable,contents:nodes.map(node=>entry(node,family))};
  }
  function entry(node,family) {
    const name=String(node.name||node.description||'Grupo');
    if(node.children?.length || node.template_picker) {
      if(node.container_type && !['meta_trait','group'].includes(node.container_type))warn(`${name}: regra de grupo ${node.container_type} requer revisão manual.`);
      const nodes=family==='eqp'&&node.children?.length ? [{...node,children:undefined,template_picker:undefined},...node.children] : (node.children??[]);
      // Equipment groups are physical containers as well as collections. Include
      // the container once, outside a picker that applies only to its contents.
      if(family==='eqp'&&node.template_picker&&node.children?.length)throw new Error(`${name}: recipiente com escolha interna requer revisão antes de importar`);
      const sub=block(nodes,family,name,node.template_picker);
      const cost=number(node.calc?.points)??sub.contents.reduce((n,e)=>n+e.cost,0);
      return {id:id(),kind:'group',name,quantity:1,level:'',cost,localNotes:[sourceNotes(node),node.reference,node.template_picker?readable(node.template_picker):''].filter(Boolean).join('\n'),subBlocks:[sub]};
    }
    const inlineItem=item(node,family);
    return {id:id(),kind:'item',itemType:inlineItem.type,name:inlineItem.name,quantity:node.quantity??1,level:['skl','spl'].includes(family)?(inlineItem.system.skill_level??''):'',cost:family==='eqp'?(inlineItem.system.cost??0):(inlineItem.system.points??0),inlineItem,hybrid:{mode:'inline',matchedBy:null}};
  }
  if(kind==='gct') {
    const blocks=[],promoted=[];
    for(const [key,family]of Object.entries({traits:'adq',skills:'skl',spells:'spl',equipment:'eqp',other_equipment:'eqp'})) {
      let ordinary=[];
      const flush=()=>{if(ordinary.length){blocks.push(block(ordinary,family,labels[family]));ordinary=[];}};
      for(const node of data[key]??[]) {
        // A root meta-trait already names a block. Keep real nested groups and
        // choices, but do not wrap the block in an identical selectable group.
        if(family==='adq'&&node.container_type==='meta_trait'&&node.children?.length) {
          flush();blocks.push(block(node.children,family,String(node.name||'Meta-Trait'),node.template_picker));
          promoted.push(Object.fromEntries(Object.entries(node).filter(([k])=>k!=='children')));
        }else ordinary.push(node);
      }
      flush();
    }
    if(!blocks.length)throw new Error('Template sem conteúdo importável');
    const name=String(data.traits?.[0]?.name||filename.replace(/\.[^.]+$/,''));
    if(data.body_type || data.notes || data.settings)warn(`${name}: notas/configuração de template preservadas; conferir manualmente.`);
    drafts.push({name,type:'template',effects:[],system:{schemaVersion:1,model_category:'generic',blocks,description:`<p>${escapeGCSHTML([sourceNotes(data),...promoted.map(node=>`Meta-Trait: ${readable(node)}`),data.body_type?readable(data.body_type):'',typeof data.notes==='object'?readable(data.notes):''].filter(Boolean).join('\n')).replace(/\n/g,'<br>')}</p>`},flags:{gum:{gcsImport:{converter:GCS_CONVERTER_VERSION,family:kind,source:structuredClone(data),...(promoted.length?{modelStructureRevision:2}:{})}}}});
  } else {
    const walk=(nodes,path=[])=>{for(const node of nodes){
      if(kind==='adq'&&node.container_type==='meta_trait'&&node.children?.length) {
        const converted=convertGCSContent({version:data.version,traits:[node]},'gct',node.name||filename,adapters);
        drafts.push(...converted.drafts);converted.warnings.forEach(warn);continue;
      }
      if(node.children?.length && !['eqp','eqm'].includes(kind)) {
        warn(`${node.name||'Grupo'}: agrupamento preservado no caminho e descrição dos componentes.`);
        const start=drafts.length;walk(node.children,[...path,node.name||node.description||'Grupo']);
        for(const child of drafts.slice(start)) {
          child.flags.gum.gcsImport.containers??=[];
          const container=Object.fromEntries(Object.entries(node).filter(([k])=>k!=='children'));
          child.flags.gum.gcsImport.containers.push(container);
          child.system.description+=`<p>Grupo GCS: ${escapeGCSHTML(readable(container))}</p>`;
        }
        continue;
      }
      drafts.push(item(node,kind,path));
      if(node.children?.length)walk(node.children,[...path,node.name||node.description||'Grupo']);
    }};walk(data.rows);
  }
  for(const draft of drafts) {
    const p=draft.flags.gum.gcsImport;p.signature=gcsImportSignature(p);p.key=gcsKey(p.signature);
    if(draft.type==='template'&&warnings.length)draft.system.description+=`<p>Pendências da importação:</p><ul>${warnings.map(w=>`<li>${escapeGCSHTML(w)}</li>`).join('')}</ul>`;
  }
  return {drafts,warnings};
}
