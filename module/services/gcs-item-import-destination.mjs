// Capture the destination when the import starts. Never substitute the world
// collection if an intended compendium becomes unavailable.
export function createGCSImportDestination({packId=null}={},environment=globalThis) {
  const {game,Item}=environment;
  const capturedPack=packId!==null?game.packs.get(packId):null;
  const label=packId!==null?`Compêndio: ${capturedPack?.title??packId}`:'Itens do mundo';
  function validateDestination() {
    if(!game.user?.isGM)throw new Error('Somente o Mestre pode importar itens');
    if(packId===null)return;
    const pack=game.packs.get(packId);
    if(!pack||pack!==capturedPack)throw new Error(`${label}: destino removido ou substituído. Abra uma nova importação.`);
    if(pack.documentName!=='Item')throw new Error(`${label}: o destino deve ser um compêndio de Itens`);
    if(pack.locked)throw new Error(`${label}: compêndio bloqueado para edição`);
    if(!pack.testUserPermission(game.user,'OWNER')||!pack.documentClass.canUserCreate(game.user))throw new Error(`${label}: sem permissão para criar itens`);
  }
  validateDestination();
  return Object.freeze({
    label,packId,validateDestination,
    isGM:()=>Boolean(game.user?.isGM),
    listItems:async()=>{validateDestination();return packId===null?[...game.items.contents]:await capturedPack.getDocuments();},
    createItem:async data=>{validateDestination();return Item.create(data,{renderSheet:false,...(packId!==null?{pack:packId}:{})});}
  });
}
