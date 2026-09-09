import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyGCSContent, planGCSItemImport} from '../module/utils/gcs-item-import-plan.mjs';
const row = {id:'t123',name:'Example',base_points:10};
test('classifies every library family and template without guessing from filename alone',()=>{
 for(const [ext,id] of Object.entries({adq:'t',adm:'m',skl:'q',spl:'p',eqp:'e',eqm:'f'})) {
  assert.equal(classifyGCSContent({version:5,rows:[{...row,id:id+'123'}]},'test.'+ext).kind,ext);
 }
 assert.equal(classifyGCSContent({version:5,traits:[row]},'test.gct').kind,'gct');
 assert.throws(()=>classifyGCSContent({version:5,rows:[row]},'test.skl'),/conflito/i);
 assert.throws(()=>classifyGCSContent({version:5,traits:[row]},'test.adq'),/conflito/i);
});
test('rejects actor renamed as template and dangerous/unsupported content',()=>{
 assert.throws(()=>classifyGCSContent({version:5,profile:{name:'Actor'},traits:[row]},'actor.gct'),/Atores/);
 assert.throws(()=>classifyGCSContent(JSON.parse('{"version":5,"rows":[],"__proto__":{}}'),'x.adq'),/chave/i);
 assert.throws(()=>classifyGCSContent({version:999,rows:[row]},'x.adq'),/versão/i);
 assert.throws(()=>classifyGCSContent({version:5,rows:[row]},'x.body'),/formato/i);
});
test('planning is per file, stable, and performs no writes',async()=>{
 const files=[{name:'a.adq',text:JSON.stringify({version:5,rows:[row]})},{name:'bad.gcs',text:'{}'}];
 const a=await planGCSItemImport(files), b=await planGCSItemImport(files);
 assert.equal(a.files[0].drafts.length,1);assert.match(a.files[1].error,/Atores/);
 assert.deepEqual(a,b);assert.equal(a.files[0].drafts[0].type,'advantage');
});
test('renamed JSON library is classified by row structure and mixed template remains a template',()=>{
 assert.equal(classifyGCSContent({version:5,rows:[{id:'q123',name:'Technique',difficulty:'h'}]},'skills.json').kind,'skl');
 assert.equal(classifyGCSContent({version:5,traits:[row],skills:[],spells:[],equipment:[]},'mixed.gct').kind,'gct');
 assert.throws(()=>classifyGCSContent({version:5,rows:[{name:'Unknown'}]},'unknown.json'),/Formato/);
 assert.throws(()=>classifyGCSContent({version:5,rows:[{name:'Unknown'}]},'unknown.skl'),/Família/);
});
test('input limits and malformed collections fail before conversion',async()=>{
 assert.throws(()=>classifyGCSContent({version:5,rows:[{...row,base_points:'many'}]},'x.adq'),/Número/);
 assert.throws(()=>classifyGCSContent({version:5,rows:[{...row,children:{}}]},'x.adq'),/Filhos/);
 let nested={};for(let i=0;i<35;i++)nested={child:nested};
 assert.throws(()=>classifyGCSContent(nested,'x.json'),/profundidade/);
 const result=await planGCSItemImport([{name:'big.adq',size:20*1024*1024,text:async()=>{throw Error('must not read');}}]);
 assert.match(result.files[0].error,/16 MB/);
});
test('GCS equipment decimal strings are accepted as finite prices, never silently zero',async()=>{
 const result=await planGCSItemImport([{name:'gear.eqp',text:JSON.stringify({version:5,rows:[{id:'e123',description:'Tool',base_value:'160.25'}]})}]);
 assert.equal(result.files[0].error,undefined);assert.equal(result.files[0].drafts[0].system.cost,160.25);
 for(const bad of ['','not a number','Infinity','1e999'])assert.throws(()=>classifyGCSContent({version:5,rows:[{id:'e123',description:'Tool',base_value:bad}]},'gear.eqp'),/Número/);
});
