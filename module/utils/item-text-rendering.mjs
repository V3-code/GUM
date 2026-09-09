// Escape at HTML boundaries; stored names and selected values remain unchanged.
export const escapeItemText = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const renderItemPropertyTag = (label,value) => value ? `<div class="property-tag"><label>${escapeItemText(label)}</label><span>${escapeItemText(value)}</span></div>` : '';
export const renderSkillLinkOptions = skills => skills.map(skill=>`<option value="${escapeItemText(skill.name)}">${escapeItemText(skill.name)} (NH ${escapeItemText(skill.system?.final_nh)})</option>`).join('');
