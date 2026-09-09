import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.Hooks={on(){}};
globalThis.HTMLElement=class {};
globalThis.game={user:{isGM:true}};
globalThis.document={createElement:()=>({style:{},addEventListener(){}})};
const {renderGCSImportPreview,addGCSItemImportButton,addGCSCompendiumImportButton}=await import('../module/apps/gcs-item-importer.js');
test('preview escapes filename, item names, warnings and errors',()=>{
 const html=renderGCSImportPreview({files:[{name:'<svg onload=x>',drafts:[{name:'<img src=x>',type:'advantage',system:{points:1}}],warnings:['<script>x</script>']},{name:'bad',error:'<iframe>',drafts:[],warnings:[]}]});
 assert.ok(!html.includes('<svg'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<iframe>'));assert.match(html,/Vantagem/);
});
test('compendium button uses compendium header and hides for locked or non-Item destinations',()=>{
 const pack={collection:'world.custom',title:'<Custom>',documentName:'Item',locked:false,testUserPermission:()=>true,documentClass:{canUserCreate:()=>true}};
 game.packs=new Map([[pack.collection,pack]]);
 class Root extends HTMLElement {constructor(){super();this.children=[];}querySelector(selector){if(selector.includes('button'))return this.children[0];return selector==='.compendium-header .header-actions'?{append:b=>this.children.push(b)}:null;}}
 const root=new Root();addGCSCompendiumImportButton({collection:pack},root);assert.equal(root.children.length,1);
 addGCSCompendiumImportButton({collection:pack},root);assert.equal(root.children.length,1);
 pack.locked=true;const locked=new Root();addGCSCompendiumImportButton({collection:pack},locked);assert.equal(locked.children.length,0);
 pack.locked=false;pack.documentName='Actor';const actors=new Root();addGCSCompendiumImportButton({collection:pack},actors);assert.equal(actors.children.length,0);
 const html=renderGCSImportPreview({files:[]},'Compêndio: <img src=x onerror=x>');assert.match(html,/Destino:/);assert.ok(!html.includes('<img'));
});
test('directory button accepts native and jQuery roots, is GM-only and does not duplicate',()=>{
 class Root extends HTMLElement {constructor(){super();this.children=[];}querySelector(selector){return selector.includes('button')?this.children[0]:{append:b=>this.children.push(b)};}}
 for(const jquery of [false,true]){const root=new Root();addGCSItemImportButton(null,jquery?[root]:root);addGCSItemImportButton(null,jquery?[root]:root);assert.equal(root.children.length,1);assert.match(root.children[0].innerHTML,/Importar do GCS$/);}
 game.user.isGM=false;const root=new Root();addGCSItemImportButton(null,root);assert.equal(root.children.length,0);game.user.isGM=true;
});
