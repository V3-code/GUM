import test from 'node:test';
import assert from 'node:assert/strict';
import {convertGCSContent} from '../module/utils/gcs-item-import-conversion.mjs';
import {escapeItemText,renderItemPropertyTag,renderSkillLinkOptions} from '../module/utils/item-text-rendering.mjs';
const payload='\"><img src=x onerror="alert(1)"><script>alert(2)</script>&';
test('imported modifier fallback fields render raw source payload as inert text',()=>{
 const data={name:payload,cost_adj:payload,reference:payload,local_notes:payload};
 const {drafts}=convertGCSContent({rows:[data]},'adm','mod.adm',{adm:node=>({type:'modifier',system:{applied_effect:node.local_notes}})});
 const item=drafts[0];assert.equal(item.name,payload);assert.equal(item.system.applied_effect,payload);
 const html=`<h3>${escapeItemText(item.name)}</h3>${renderItemPropertyTag('Efeito',item.system.applied_effect)}${renderItemPropertyTag('Custo',item.system.cost)}${renderItemPropertyTag('Referência',item.system.ref)}`;
 assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));assert.match(html,/&lt;img/);assert.match(html,/&quot;/);assert.match(html,/&amp;/);
 assert.ok(!renderItemPropertyTag(payload,payload).includes('<img'));
});
test('skill option escapes both attribute and text while selection value decodes to the original name',()=>{
 const skill={name:payload,system:{final_nh:'<img onerror=x>'}};
 const html=renderSkillLinkOptions([skill]);
 assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));
 const value=html.match(/^<option value="([^"]*)">/)[1];
 const decoded=value.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 assert.equal(decoded,payload);assert.equal(skill.name,payload);
});
