import {isTemplateProvenanceUpdate} from './template-lifecycle-view.mjs';
const operations=new Map(),actorQueues=new Map();let sequence=0;

function provenanceHookUpdate(changes) {
  const cleaned={};
  // Foundry DocumentStatsField.managedFields: server-owned metadata only.
  // Keep pre-CRUD validation strict; this normalization is used only inside a registered hook.
  const metadata=(key,value)=>['modifiedTime','createdTime'].includes(key)
    ? typeof value==='number'&&Number.isFinite(value)
    : ['coreVersion','systemId','systemVersion','lastModifiedBy'].includes(key)&&(value===null||typeof value==='string');
  for(const [key,value] of Object.entries(changes||{})) {
    if(key==='_stats') {
      if(!value||typeof value!=='object'||Array.isArray(value)||!Object.entries(value).every(([k,v])=>metadata(k,v)))return false;
    } else if(key.startsWith('_stats.')) {
      if(!metadata(key.slice(7),value))return false;
    } else cleaned[key]=value;
  }
  return isTemplateProvenanceUpdate(cleaned);
}

export async function runTemplateDocumentOperation(scope,crud) {
  if(scope.kind==='unlink'&&!isTemplateProvenanceUpdate(scope.changes)) throw new Error('Unlink aceita somente proveniência de modelo.');
  const id=`template-${Date.now()}-${++sequence}`;
  const operation={...scope,pending:[]};operations.set(id,operation);
  let result,crudError;
  try {result=await crud({gumTemplateOperation:{id}});} catch(error){crudError=error;}
  const errors=[];
  try {
    // Keep settled entries until consumed: a fast rejection must not disappear.
    for(let i=0;i<operation.pending.length;i++) {
      const error=await operation.pending[i];if(error) errors.push(error);
    }
  } finally {operations.delete(id);}
  if(crudError) throw crudError;
  if(errors.length) throw new Error(errors.map(e=>e.message||String(e)).join('; '));
  return result;
}

export function trackTemplateDocumentHook(kind,callback) {
  return (...args)=>{
    const [item]=args,options=args[kind==='update'?2:1],userId=args[kind==='update'?3:2];
    const op=operations.get(options?.gumTemplateOperation?.id);
    const expectedKind=op?.kind==='unlink'?'update':op?.kind;
    const scoped=op&&expectedKind===kind&&op.actorUuid===item.parent?.uuid&&op.userId===userId
      &&(op.itemIds?op.itemIds.includes(item.id):item.flags?.gum?.templateApplicationId===op.applicationId);
    if(!scoped) return callback(...args,false);
    if(op.kind==='unlink'&&provenanceHookUpdate(args[1])) return;
    const previous=actorQueues.get(op.actorUuid)||Promise.resolve();
    const task=previous.then(()=>callback(...args,true));
    const settled=task.then(()=>null,error=>error);
    op.pending.push(settled); // Synchronous registration, before the hook's first await.
    const queue=settled.then(()=>{});actorQueues.set(op.actorUuid,queue);
    queue.then(()=>{if(actorQueues.get(op.actorUuid)===queue)actorQueues.delete(op.actorUuid);});
    return settled;
  };
}
