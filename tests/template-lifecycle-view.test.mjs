import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../module/utils/template-lifecycle-view.mjs').catch(()=>({}));
test('previews escape text and attributes including quote-bearing IDs',()=>{
  assert.equal(typeof api.escapeTemplateText,'function');
  assert.equal(api.escapeTemplateText(`"'<script>&`),'&quot;&#39;&lt;script&gt;&amp;');
  const html=api.renderTemplateLifecyclePreview({warnings:[`<img src=x onerror="alert(1)">`],deleteIds:[`" onmouseover='run()'`],unlinkIds:[],updateData:{'system.attributes.<bad>.value':2}});
  assert.ok(!html.includes('<img'));assert.ok(!html.includes('<bad>'));assert.ok(html.includes('&quot;'));
});
test('pending records remain visible after reload and prevent new mutations',()=>{
  const view=api.templateModelView([{applicationId:'a',state:'applying'},{applicationId:'b',state:'removing'},{applicationId:'c',state:'recovery-required'},{applicationId:'d',state:'removed',removedAt:'now'}]);
  assert.equal(view.blocked,true);assert.equal(view.models.length,3);assert.ok(view.models.every(r=>r.pending));
});
test('provenance-only filter accepts nested and flattened patches but never mixed mechanics',()=>{
  const isOnly=api.isTemplateProvenanceUpdate;
  assert.equal(isOnly({_id:'i','flags.gum.-=templateApplicationId':null}),true);
  assert.equal(isOnly({flags:{gum:{templateApplicationId:'A',templateApplied:{templateName:'x'}}}}),true);
  assert.equal(isOnly({_id:'i',flags:{gum:{'-=templateApplied':null}},system:{points:4}}),false);
  assert.equal(isOnly({flags:{gum:{templateApplicationId:'A',manual_override:true}}}),false);
  assert.equal(isOnly({_id:'i'}),false);
});
test('preview distinguishes explicit bonuses, recalculated fields and current resources',()=>{
  const html=api.renderTemplateLifecyclePreview({});
  assert.match(html,/mesmo após edição manual/);
  assert.match(html,/PV e PF atuais/);
  assert.match(html,/campos recalculados/);
});
