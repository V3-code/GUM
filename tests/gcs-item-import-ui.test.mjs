import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.Hooks={on(){}};
globalThis.HTMLElement=class {};
globalThis.game={user:{isGM:true}};
globalThis.document={createElement:()=>({style:{},addEventListener(){}})};
const {renderGCSImportPreview,addGCSItemImportButton}=await import('../module/apps/gcs-item-importer.js');
test('preview escapes filename, item names, warnings and errors',()=>{
 const html=renderGCSImportPreview({files:[{name:'<svg onload=x>',drafts:[{name:'<img src=x>',type:'advantage',system:{points:1}}],warnings:['<script>x</script>']},{name:'bad',error:'<iframe>',drafts:[],warnings:[]}]});
 assert.ok(!html.includes('<svg'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<iframe>'));assert.match(html,/Vantagem/);
});
test('directory button accepts native and jQuery roots, is GM-only and does not duplicate',()=>{
 class Root extends HTMLElement {constructor(){super();this.children=[];}querySelector(selector){return selector.includes('button')?this.children[0]:{append:b=>this.children.push(b)};}}
 for(const jquery of [false,true]){const root=new Root();addGCSItemImportButton(null,jquery?[root]:root);addGCSItemImportButton(null,jquery?[root]:root);assert.equal(root.children.length,1);assert.equal(root.children[0].textContent,'Importar do GCS');}
 game.user.isGM=false;const root=new Root();addGCSItemImportButton(null,root);assert.equal(root.children.length,0);game.user.isGM=true;
});
