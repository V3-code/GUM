import { applyContingentCondition } from "../main.js";

export default class DamageApplicationWindow extends Application {
    
    constructor(damageData, attackerActor, targetActor, options = {}) {
        super(options);
        this.damageData = damageData;
        this.attackerActor = attackerActor;
        this.targetActor = targetActor;
        
        this.effectState = {};
        this.isApplying = false;

        this.state = {
            finalInjury: 0,
            targetDR: 0,
            activeDamageKey: 'main'
        };

        this.options.title = `Aplicar Dano em ${this.targetActor?.name || "Alvo"}`;
    }

    _getDynamicDR(locationKey, damageType) {
        if (!locationKey) return 0;
        // Custom DR comes from user input
        if (locationKey === 'custom') {
            const customInput = this.form?.querySelector('input[name="custom_dr"]');
            return parseInt(customInput?.value || 0);
        }

        // Pull DR data from actor (supports per-type modifiers)
        const drData = foundry.utils.getProperty(this.targetActor, `system.combat.dr_locations.${locationKey}`) || {};
        const baseDR = typeof drData === "object" ? (parseInt(drData.base) || 0) : (parseInt(drData) || 0);
        if (!damageType || damageType === "base") return baseDR;

        const typeMod = typeof drData === "object" ? (parseInt(drData[damageType]) || 0) : 0;
        return Math.max(0, baseDR + typeMod);
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: `Aplicar Dano`,
            template: "systems/gum/templates/apps/damage-application.hbs",
            classes: ["dialog", "gurps", "damage-application-dialog"],
            width: 760,
            height: "auto",
            resizable: true,
            buttons: {}
        });
    }

    async getData() {
        // ... (Seu método getData, 100% preservado e sem alterações)
        const context = await super.getData();
        context.damage = this.damageData;
        context.attacker = this.attackerActor;
        context.target = this.targetActor;
        const damageablePools = [];
        damageablePools.push({ path: 'system.attributes.hp.value', label: `Pontos de Vida (PV)` });
        damageablePools.push({ path: 'system.attributes.fp.value', label: `Pontos de Fadiga (PF)` });
        const combatMeters = this.targetActor.system.combat.combat_meters || {};
        for (const [key, meter] of Object.entries(combatMeters)) { damageablePools.push({ path: `system.combat.combat_meters.${key}.value`, label: meter.name }); }
        const spellReserves = this.targetActor.system.spell_reserves || {};
        for (const [key, reserve] of Object.entries(spellReserves)) { damageablePools.push({ path: `system.spell_reserves.${key}.value`, label: `RM:${reserve.name}` }); }
        const powerReserves = this.targetActor.system.power_reserves || {};
        for (const [key, reserve] of Object.entries(powerReserves)) { damageablePools.push({ path: `system.power_reserves.${key}.value`, label: `RP:${reserve.name}` }); }
        context.damageablePools = damageablePools;
        const locationsData = { "head": { label: "Crânio", roll: "3-4", dr: 0 }, "face": { label: "Rosto", roll: "5", dr: 0 }, "leg": { label: "Perna", roll: "6-7, 13-14", dr: 0 }, "arm": { label: "Braço", roll: "8, 12", dr: 0 }, "torso": { label: "Torso", roll: "9-11", dr: 0 }, "groin": { label: "Virilha", roll: "11", dr: 0 }, "vitals": { label: "Órg. Vitais", roll: "--", dr: 0 }, "hand": { label: "Mão", roll: "15", dr: 0 }, "foot": { label: "Pé", roll: "16", dr: 0 }, "neck": { label: "Pescoço", roll: "17-18", dr: 0 }, "eyes": { label: "Olhos", roll: "--", dr: 0 } };
        locationsData["custom"] = { label: "Outro", roll: "--", dr: 0, custom: true };
        const manualDRMods = this.targetActor.system.combat.dr_mods || {};
        for (const [key, mod] of Object.entries(manualDRMods)) { if (locationsData[key]) { locationsData[key].dr += parseInt(mod) || 0; } }
        const equippedArmor = this.targetActor.items.filter(i => i.type === 'armor' && i.system.location === 'equipped');
        for (const armor of equippedArmor) { const armorDR = parseInt(armor.system.dr) || 0; if (armor.system.worn_locations) { for (const locationKey of armor.system.worn_locations) { if (locationsData[locationKey]) { locationsData[locationKey].dr += armorDR; } } } }
        context.locations = Object.entries(locationsData).map(([key, data]) => { data.key = key; data.totalDR = data.dr; return data; });
        context.locations.sort((a, b) => { const firstRollA = parseInt(a.roll.split(/[,-]/)[0]); const firstRollB = parseInt(b.roll.split(/[,-]/)[0]); if (isNaN(firstRollA)) return 1; if (isNaN(firstRollB)) return -1; return firstRollA - firstRollB; });
        const mainDamageType = this.damageData.main?.type?.toLowerCase() || '';
        const woundingModifiersList = [ { type: "Queimadura", abrev: "qmd", mult: 1 }, { type: "Corrosão", abrev: "cor", mult: 1 }, { type: "Toxina", abrev: "tox", mult: 1 }, { type: "Contusão", abrev: "cont", mult: 1 }, { type: "Corte", abrev: "cort", mult: 1.5 }, { type: "Perfuração", abrev: "perf", mult: 2 }, { type: "Perfurante", abrev: "pi", mult: 1 }, { type: "Pouco Perfurante", abrev: "pi-", mult: 0.5 }, { type: "Muito Perfurante", abrev: "pi+", mult: 1.5 }, { type: "Ext. Perfurante", abrev: "pi++", mult: 2 } ];
        let defaultModFound = false;
        context.woundingModifiers = woundingModifiersList.map(mod => { mod.checked = (mod.abrev === mainDamageType); if (mod.checked) defaultModFound = true; return mod; });
        context.noModChecked = !defaultModFound;
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);
        const form = html[0];
        this.form = form;

        // --- SEUS LISTENERS ORIGINAIS (INTACTOS) ---
        form.querySelectorAll('.damage-card').forEach(card => {
            card.addEventListener('click', ev => {
                form.querySelectorAll('.damage-card.active').forEach(c => c.classList.remove('active'));
                ev.currentTarget.classList.add('active');
                const damageType = ev.currentTarget.querySelector('.damage-label')?.textContent?.match(/[a-zA-Z+]+/)?.[0];
                if (damageType) {
                    const allRadios = form.querySelectorAll('input[name="wounding_mod_type"]');
                    let matched = false;
                    allRadios.forEach(r => {
                        const label = r.closest('.wounding-row')?.textContent;
                        if (label?.toLowerCase().includes(damageType.toLowerCase())) { r.checked = true; matched = true; }
                    });
                    if (!matched) { const noModRadio = form.querySelector('input[name="wounding_mod_type"][value="1"]'); if (noModRadio) noModRadio.checked = true; }
                } else {
                    const allRadios = form.querySelectorAll('input[name="wounding_mod_type"]');
                    for (let r of allRadios) { const label = r.closest('.wounding-row')?.textContent?.toLowerCase() || ''; if (r.value === '1' && label.includes("sem modificador")) { r.checked = true; break; } }
                }
                const newDamage = this.damageData[ev.currentTarget.dataset.damageKey];
                const damageInput = form.querySelector('[name="damage_rolled"]');
                const armorInput = form.querySelector('[name="armor_divisor"]');
                if (damageInput) damageInput.value = newDamage.total || 0;
                if (armorInput) armorInput.value = newDamage.armorDivisor || 1;
                this._updateDamageCalculation(form);
            });
        });
        
        form.querySelectorAll('.location-row').forEach(row => {
            row.addEventListener('click', ev => {
                form.querySelectorAll('.location-row.active').forEach(r => r.classList.remove('active'));
                ev.currentTarget.classList.add('active');
                const targetDR = ev.currentTarget.dataset.dr;
                form.querySelector('[name="target_dr"]').value = targetDR;
                const locationKey = ev.currentTarget.dataset.locationKey;
                const newMods = this._getAdjustedWoundingModifiers(locationKey);
                const modTable = form.querySelector('.wounding-table');

                if (modTable) {
                    const selectedRadio = form.querySelector('input[name="wounding_mod_type"]:checked');
                    let selectedAbrev = '';
                    if (selectedRadio) { 
                        const labelSpan = selectedRadio.closest('.wounding-row')?.querySelector('.type'); 
                        selectedAbrev = labelSpan?.textContent?.match(/\(([^)]+)\)/)?.[1] || ''; 
                    }

                    // 1. Constrói a parte dinâmica da lista
                    let htmlContent = newMods.map(mod => `<div class="wounding-row mod-group-${mod.group || 'x'}"><label class="custom-radio"><input type="radio" name="wounding_mod_type" value="${mod.mult}" ${mod.abrev === selectedAbrev ? 'checked' : ''}/><span class="type">${mod.type} (${mod.abrev})</span><span class="dots"></span><span class="mult">x${mod.mult}</span></label></div>`).join('');

                    // 2. Adiciona as opções estáticas ("Sem Modificador" e "Outros")
                    htmlContent += `<hr style="margin-top: 6px; margin-bottom: 6px;">`;

                    htmlContent += `
                        <div class="wounding-row">
                            <label class="custom-radio">
                                <input type="radio" name="wounding_mod_type" value="1" ${selectedAbrev === '' ? 'checked' : ''}/>
                                <span>Sem Modificador</span>
                                <span class="dots"></span>
                                <span class="mult">x1</span>
                            </label>
                        </div>`;

                    htmlContent += `
                        <div class="wounding-row">
                            <label class="custom-radio">
                                <input type="radio" name="wounding_mod_type" value="custom"/>
                                <span>Outros Mod.:</span>
                                <input type="number" name="custom_wounding_mod" value="1" step="0.5" class="custom-mod-input"/>
                            </label>
                        </div>`;

                    // 3. Insere o HTML completo na tabela
                    modTable.innerHTML = htmlContent;

                    // 4. Reativa os "ouvintes" nos novos botões que acabamos de criar
                    modTable.querySelectorAll('input[name="wounding_mod_type"]').forEach(input => {
                        input.addEventListener('change', () => this._updateDamageCalculation(form));
                    });

                    const customModInput = modTable.querySelector('input[name="custom_wounding_mod"]');
                    if (customModInput) {
                        customModInput.addEventListener('input', () => this._updateDamageCalculation(form));
                    }
                }
                
                this._updateDamageCalculation(form);
            });
        });
        
        form.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('change', () => this._updateDamageCalculation(form));
            input.addEventListener('input', () => this._updateDamageCalculation(form));
        });
        
        // --- ✅ NOVOS LISTENERS ADICIONADOS AO FINAL ---
        html.on('change', '.contingent-effect-toggle', ev => {
            const effectId = $(ev.currentTarget).closest('.effect-card').data('effectId');
            if (this.effectState[effectId]) this.effectState[effectId].checked = ev.currentTarget.checked;
            this._updateDamageCalculation(form);
        });

        html.on('click', '.npc-resistance-roll', ev => {
            const effectId = $(ev.currentTarget).closest('.effect-card').data('effectId');
            this._onNpcResistanceRoll(effectId);
        });

        html.find('button[data-action="proposeTests"]').on('click', () => this._onProposeTests(form));
        html.find('button[data-action="applyAndPublish"]').on('click', () => this._onApplyDamage(form, true, true));
        html.find('button[data-action="applyAndClose"]').on('click', () => this._onApplyDamage(form, true, false));
        html.find('button[data-action="applyAndKeepOpen"]').on('click', () => this._onApplyDamage(form, false, false));
        
        // --- Disparo Inicial (Preservando sua lógica de "Torso") ---
        const torsoRow = form.querySelector('.location-row[data-location-key="torso"]');
        if (torsoRow) {
            torsoRow.click();
        } else {
            this._updateDamageCalculation(form);
        }
    }

async _updateDamageCalculation(form) {
    const activeCard = form.querySelector('.damage-card.active');
    const activeDamageKey = activeCard ? activeCard.dataset.damageKey : 'main';
    const activeDamage = this.damageData[activeDamageKey] || this.damageData.main;
    const damageRolledInput = form.querySelector('[name="damage_rolled"]');
    const armorDivisorInput = form.querySelector('[name="armor_divisor"]');
    let damageRolled = parseFloat(damageRolledInput?.value);
    let armorDivisor = parseFloat(armorDivisorInput?.value);

    // ✅ CORREÇÃO: Lendo TODAS as checkboxes no início da função
    const halfDamageChecked = form.querySelector('[name="special_half_damage"]')?.checked;
    const explosionChecked = form.querySelector('[name="special_explosion"]')?.checked;
    const effectsOnlyChecked = form.querySelector('[name="special_apply_effects_only"]')?.checked;
    const applyAsHeal = form.querySelector('[name="special_apply_as_heal"]')?.checked;

    const explosionDistance = parseInt(form.querySelector('[name="special_explosion_distance"]')?.value) || 0;
    const toleranceType = form.querySelector('[name="tolerance_type"]')?.value || null;
    if (isNaN(damageRolled)) { damageRolled = activeDamage.total; if (damageRolledInput) damageRolledInput.value = damageRolled; }
    if (!armorDivisor || armorDivisor <= 0) { armorDivisor = activeDamage.armorDivisor || 1; if (armorDivisorInput) armorDivisorInput.value = armorDivisor; }
    const effects = [];
    let originalBase = damageRolled;
    let modifiedBase = damageRolled;
    if (halfDamageChecked) { modifiedBase = Math.floor(modifiedBase / 2); effects.push(`🟡 Dano reduzido pela metade (1/2D): ${originalBase} ➜ ${modifiedBase}`); originalBase = modifiedBase; }
    if (explosionChecked && explosionDistance > 0) { const divisor = Math.max(1, 3 * explosionDistance); const preExplosion = modifiedBase; modifiedBase = Math.floor(modifiedBase / divisor); effects.push(`🔴 Explosão: ${preExplosion} ➜ ${modifiedBase} (÷${divisor})`); }
    damageRolled = modifiedBase;
    // Atualiza visualização de RD por local de acordo com o tipo de dano
    const damageTypeKey = this.damageTypeAbrev || 'base';
    form.querySelectorAll('.location-row').forEach(row => {
        const locKey = row.dataset.locationKey;
        if (locKey === 'custom') return;
        const dynamicDR = this._getDynamicDR(locKey, damageTypeKey);
        row.dataset.dr = dynamicDR;
        const drEl = row.querySelector('.dr');
        if (drEl) drEl.textContent = dynamicDR;
    });

    let selectedLocationDR = 0;
    const activeRow = form.querySelector('.location-row.active');
    if (activeRow) {
        const locKey = activeRow.dataset.locationKey;
        selectedLocationDR = this._getDynamicDR(locKey, damageTypeKey);
    }
    const ignoreDR = form.querySelector('[name="ignore_dr"]')?.checked;
    
    const effectiveDR = ignoreDR ? 0 : Math.floor(selectedLocationDR / armorDivisor);
    let penetratingDamage = Math.max(0, damageRolled - effectiveDR);
    let selectedModRadio = form.querySelector('input[name="wounding_mod_type"]:checked');
    let woundingMod = 1;
    if (selectedModRadio) { if (selectedModRadio.value === 'custom') { woundingMod = parseFloat(form.querySelector('[name="custom_wounding_mod"]')?.value) || 1; } else { woundingMod = parseFloat(selectedModRadio.value) || 1; } }
    const damageAbrev = selectedModRadio?.closest('.wounding-row')?.querySelector('.type')?.textContent?.match(/\(([^)]+)\)/)?.[1]?.toLowerCase() || '';
    this.damageTypeAbrev = damageAbrev;
    if (toleranceType === "nao-vivo") { const table = { "perf": 1, "pi": 1 / 3, "pi-": 0.2, "pi+": 0.5, "pi++": 1 }; if (table[damageAbrev] !== undefined) { woundingMod = table[damageAbrev]; effects.push("⚙️ Tolerância: Não Vivo (mod. ajustado)"); } }
    if (toleranceType === "homogeneo") { const table = { "perf": 0.5, "pi": 0.2, "pi-": 0.1, "pi+": 1 / 3, "pi++": 0.5 }; if (table[damageAbrev] !== undefined) { woundingMod = table[damageAbrev]; effects.push("⚙️ Tolerância: Homogêneo (mod. ajustado)"); } }
    if (toleranceType === "difuso") { woundingMod = 1; effects.push("⚙️ Tolerância: Difuso (lesão máx. = 1)"); }
    let finalInjury = Math.floor(penetratingDamage * woundingMod);
    if (toleranceType === "difuso") finalInjury = Math.min(1, finalInjury);
    if (effectsOnlyChecked) { finalInjury = 0; } // Zera a lesão se a opção estiver marcada

    const selectedLocationLabel = form.querySelector('.location-row.active .label')?.textContent || '(Selecione)';
    const drDisplay = (armorDivisor && armorDivisor !== 1) ? `${selectedLocationDR} ÷ ${armorDivisor} = ${effectiveDR}` : `${selectedLocationDR}`;
    let modName = '';
        if (selectedModRadio) {
            // Pega o texto da linha inteira do radio button selecionado
            const selectedRowText = selectedModRadio.closest('.wounding-row')?.textContent || '';

            if (selectedModRadio.value === 'custom') {
                modName = 'outros mod.';
            } else if (selectedRowText.includes('Sem Modificador')) {
                // Agora checamos pelo texto, que é único para esta opção
                modName = 'sem mod.';
            } else {
                // Para todos os outros, extrai a abreviação dos parênteses
                modName = selectedRowText.match(/\(([^)]+)\)/)?.[1] || 'mod';
            }
        }
    const field = (sel) => form.querySelector(`[data-field="${sel}"]`);
    if (field("base_damage_note")) { if (halfDamageChecked && explosionChecked && explosionDistance > 0) { field("base_damage_note").textContent = `÷ 2 ÷ ${3 * explosionDistance} = ${modifiedBase}`; } else if (halfDamageChecked) { field("base_damage_note").textContent = `÷ 2 = ${modifiedBase}`; } else if (explosionChecked && explosionDistance > 0) { field("base_damage_note").textContent = `÷ ${3 * explosionDistance} = ${modifiedBase}`; } else { field("base_damage_note").textContent = ''; } }
    if (field("damage_rolled")) field("damage_rolled").textContent = damageRolled;
    if (field("target_dr")) field("target_dr").textContent = `${drDisplay} (${selectedLocationLabel})`;
    if (field("armor_divisor")) field("armor_divisor").textContent = armorDivisor;
    if (field("penetrating_damage")) field("penetrating_damage").textContent = penetratingDamage;
    if (field("wounding_mod")) field("wounding_mod").textContent = `x${woundingMod} (${modName})`;
    if (field("final_injury")) field("final_injury").textContent = finalInjury;
    const effectsList = form.querySelector(".effects-list");
    if (effectsList) { effectsList.innerHTML = ""; for (let effect of effects) { effectsList.innerHTML += `<li>${effect}</li>`; } }
    this.finalInjury = finalInjury;

    // --- ✅ BLOCO DE FEEDBACK E NOTAS (VERSÃO UNIFICADA E CORRIGIDA) ---
    const notesContainer = form.querySelector(".calculation-notes");
    const injuryLabel = form.querySelector(".final-injury-compact label");
    const injuryValue = form.querySelector(".final-injury-compact span");
    let notesHtml = "";

    if (effectsOnlyChecked) {
        notesHtml += `<li class="feedback-note">Apenas efeitos serão aplicados.</li>`;
    }
    if (applyAsHeal) {
    notesHtml += `<li class="feedback-note">O valor final será aplicada como restauração.</li>`;
    if (injuryLabel) {
        injuryLabel.textContent = "Restauração";
        injuryLabel.style.color = "#3b7d3b"; // ✅ Cor do label adicionada
    }
    if (injuryValue) injuryValue.style.color = "#3b7d3b"; // Verde
    } else {
    // Garante que volta ao normal se a caixa for desmarcada
    if (injuryLabel) {
        injuryLabel.textContent = "Lesão";
        injuryLabel.style.color = "#c53434"; // ✅ Cor do label resetada
    }
    if (injuryValue) injuryValue.style.color = "#c53434"; // Vermelho
    }

    if (halfDamageChecked) { notesHtml += `<li>1/2D: Dano base reduzido.</li>`; }
    if (explosionChecked && explosionDistance > 0) { const divisor = Math.max(1, 3 * explosionDistance); notesHtml += `<li>Explosão: Dano dividido por ${divisor}.</li>`; }
    if (toleranceType) { const toleranceName = { "nao-vivo": "Não Vivo", "homogeneo": "Homogêneo", "difuso": "Difuso"}[toleranceType]; notesHtml += `<li>Tolerância: ${toleranceName} aplicada.</li>`; }

    if (notesContainer) { notesContainer.innerHTML = notesHtml ? `<ul>${notesHtml}</ul>` : ""; }
    
    // --- LÓGICA DE PREVIEW DE EFEITOS CONTINGENTES (permanece igual) ---
    const effectsSummaryEl = form.querySelector(".effects-summary");
    const actionButtonsEl = form.querySelector(".action-buttons");
    const contingentEffects = this.damageData.contingentEffects || {};
    const eventContext = { damage: this.finalInjury, target: this.targetActor, attacker: this.attackerActor };
    let potentialEffectsHTML = '';
    let hasPotentialEffects = false;
    let needsResistanceRoll = false;

    for (const [id, effect] of Object.entries(contingentEffects)) {
        if (effect.trigger !== 'onDamage') continue;
        let conditionMet = !effect.condition || effect.condition.trim() === '';
        if (effect.condition) {
            try { conditionMet = Function("actor", "event", `return (${effect.condition})`)(this.targetActor, eventContext); } catch(e) { console.warn("GUM | Erro na condição do efeito (preview):", e); conditionMet = false; }
        }

        if (conditionMet) {
            hasPotentialEffects = true;
            if (this.effectState[id] === undefined) this.effectState[id] = { checked: true };
            const isChecked = this.effectState[id].checked;
            const conditionItem = await fromUuid(effect.payload);
            const conditionName = conditionItem ? conditionItem.name : "Condição Desconhecida";
            let resistanceHTML = '<span class="eff-type">(Automático)</span>';
            if (effect.resistanceRoll) {
                if (isChecked) needsResistanceRoll = true;
                resistanceHTML = `<span class="eff-type">(Teste de ${effect.resistanceRoll.attribute.toUpperCase()})</span><a class="npc-resistance-roll" data-effect-id="${id}" title="Rolar para NPC"><i class="fas fa-dice-d20"></i></a>`;
            }
            potentialEffectsHTML += `<div class="effect-card" data-effect-id="${id}"><label class="custom-checkbox"><input type="checkbox" class="contingent-effect-toggle" ${isChecked ? 'checked' : ''}><span>${conditionName}</span></label>${resistanceHTML}</div>`;
        }
    }
    
    effectsSummaryEl.innerHTML = hasPotentialEffects ? potentialEffectsHTML : `<div class="placeholder">Nenhum efeito adicional</div>`;
    const proposeButton = actionButtonsEl.querySelector('button[data-action="proposeTests"]');
    if (proposeButton) { if (needsResistanceRoll) { proposeButton.style.display = 'inline-block'; } else { proposeButton.style.display = 'none'; } }
}
    
    _onProposeTests(form) {
        ui.notifications.info("Enviando propostas de teste para o chat...");
        for (const [id, state] of Object.entries(this.effectState)) {
            if (state.checked) {
                const effect = this.damageData.contingentEffects[id];
                if (effect?.resistanceRoll) {
                    const eventContext = { damage: this.finalInjury, target: this.targetActor, attacker: this.attackerActor };
                    this._promptResistanceRoll(effect, eventContext);
                }
            }
        }
        this.element.find('button[data-action="proposeTests"]').prop('disabled', true).text('Testes Propostos');
    }
    
    async _onNpcResistanceRoll(effectId) {
        // ... (Este método, sem alterações)
        const effect = this.damageData.contingentEffects[effectId];
        const eventContext = { damage: this.finalInjury, target: this.targetActor, attacker: this.attackerActor };
        const rollData = effect.resistanceRoll;
        const target = eventContext.target;
        let baseAttributeValue = getProperty(target.system.attributes, `${rollData.attribute}.final`) || 10;
        let totalModifier = parseInt(rollData.modifier) || 0;
        if (rollData.dynamicModifier) {
            try { totalModifier += Function("actor", "event", `return (${rollData.dynamicModifier})`)(target, eventContext); } catch(e) { console.warn(`GUM | Erro ao avaliar modificador dinâmico:`, e); }
        }
        const finalTarget = baseAttributeValue + totalModifier;
        const roll = new Roll("3d6");
        await roll.evaluate();
        const success = roll.total <= finalTarget;
        const resultText = `<strong>Rolagem de NPC (${effect.resistanceRoll.attribute.toUpperCase()}):</strong> ${roll.total} vs ${finalTarget} - ${success ? "<span style='color: green;'>SUCESSO</span>" : "<span style='color: red;'>FALHA</span>"}`;
        ChatMessage.create({ content: resultText, whisper: ChatMessage.getWhisperRecipients("GM") });
        if (success && (rollData.on === 'failure')) {
            this.effectState[effectId].checked = false;
            this._updateDamageCalculation(this.form);
        }
    }
    
    async _onApplyDamage(form, shouldClose, shouldPublish) {
        const effectsOnlyChecked = form.querySelector('[name="special_apply_effects_only"]')?.checked;
        if (this.isApplying) return;
        this.isApplying = true;
        try {
            const finalInjury = this.finalInjury || 0;
            const applyAsHeal = form.querySelector('[name="special_apply_as_heal"]')?.checked;
            const selectedPoolPath = form.querySelector('[name="damage_target_pool"]').value;
            if (!selectedPoolPath) { this.isApplying = false; return ui.notifications.error("Nenhum alvo para o dano foi selecionado."); }
            const currentPoolValue = foundry.utils.getProperty(this.targetActor, selectedPoolPath);
            let eventData = null;

            if (!applyAsHeal && finalInjury > 0 && !effectsOnlyChecked) {
                eventData = { type: "damage", damage: finalInjury, damageType: this.damageTypeAbrev };
                const newPoolValue = currentPoolValue - finalInjury;
                await this.targetActor.update({ [selectedPoolPath]: newPoolValue }, { gumEventData: eventData });
            } else {
                const sign = applyAsHeal ? 1 : -1;
                const newPoolValue = currentPoolValue + (sign * finalInjury);
                await this.targetActor.update({ [selectedPoolPath]: newPoolValue });
            }

            // Processa os efeitos FINAIS que permaneceram marcados.
            const effectsToProcess = [];
            for (const [id, state] of Object.entries(this.effectState)) {
                if (state.checked) { effectsToProcess.push(this.damageData.contingentEffects[id]); }
            }
            if (effectsToProcess.length > 0) {
                const eventContext = { damage: finalInjury, target: this.targetActor, attacker: this.attackerActor };
                for (const effect of effectsToProcess) {
                    if (!effect.resistanceRoll) {
                        await this._executeContingentAction(effect, eventContext);
                    }
                }
            }

if (shouldPublish) {
    const appliedEffectNames = [];
    for (const effect of effectsToProcess) {
        const conditionItem = await fromUuid(effect.payload);
        if (conditionItem) {
            appliedEffectNames.push(conditionItem.name);
        }
    }

    const poolLabel = form.querySelector('[name="damage_target_pool"] option:checked').textContent;
    let resultLine = '';

    if (applyAsHeal && finalInjury > 0) {
        resultLine = `<p>Recuperou <strong>${finalInjury} em ${poolLabel}</strong>.</p>`;
    } else if (finalInjury > 0 && !effectsOnlyChecked) {
        resultLine = `<p>Sofreu <strong>${finalInjury} de lesão</strong> em ${poolLabel}.</p>`;
    }

    // Monta o HTML final com a nova estrutura de texto
    let messageContent = `
        <div class="gurps-roll-card">
            <header class="card-header">
                <h3>Resumo do Ataque</h3>
            </header>
            <div class="card-content">
                <div class="summary-actors vertical">
                    <div class="actor-line">
                        <img src="${this.attackerActor.img}" class="actor-token-icon">
                        <strong>${this.attackerActor.name}</strong>
                    </div>
                    <div class="arrow-line">
                        <i class="fas fa-arrow-down"></i>
                    </div>
                    <div class="actor-line">
                        <img src="${this.targetActor.img}" class="actor-token-icon">
                        <strong>${this.targetActor.name}</strong>
                    </div>
                </div>

                ${resultLine ? `
                <div class="minicard result-card">
                    <div class="minicard-title">Resultado</div>
                    ${resultLine}
                </div>
                ` : ''}

                ${appliedEffectNames.length > 0 ? `
                <div class="minicard effects-card">
                    <div class="minicard-title">Efeitos Aplicados</div>
                    ${appliedEffectNames.map(name => `<p><strong>${name}</strong></p>`).join('')}
                </div>
                ` : ''}
            </div>
        </div>
    `;

    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.attackerActor }),
        content: messageContent
    });
}

            if (shouldClose) { this.close(); }
        } finally {
            this.isApplying = false;
        }
    }

    async _executeContingentAction(effect, eventContext) {
        if (effect.action === 'applyCondition') {
            await applyContingentCondition(eventContext.target, effect, eventContext);
        }
    }

    async _promptResistanceRoll(effect, eventContext) {
        // ... (Seu método _promptResistanceRoll, sem alterações)
        const rollData = effect.resistanceRoll;
        const target = eventContext.target;
        let baseAttributeValue = getProperty(target.system.attributes, `${rollData.attribute}.final`) || 10;
        let totalModifier = parseInt(rollData.modifier) || 0;
        if (rollData.dynamicModifier) {
            try { totalModifier += Function("actor", "event", `return (${rollData.dynamicModifier})`)(target, eventContext); } catch(e) { console.warn(`GUM | Erro ao avaliar modificador dinâmico:`, e); }
        }
        const finalTarget = baseAttributeValue + totalModifier;
        const chatButtonPayload = { targetActorId: target.id, finalTarget: finalTarget, contingentEffect: effect };
        const content = `<div class="gurps-resistance-roll-card"><p><strong>${target.name}</strong> precisa resistir a um efeito de <strong>${this.attackerActor.name}</strong>!</p><p>Faça um teste de <strong>${rollData.attribute.toUpperCase()}</strong> para evitar o efeito.</p><button type="button" class="resistance-roll-button" data-roll-data='${JSON.stringify(chatButtonPayload)}'><i class="fas fa-dice-d6"></i> Rolar Teste de Resistência (vs ${finalTarget})</button></div>`;
        ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }), content: content });
    }
    
    _getAdjustedWoundingModifiers(locationKey) {
        // ... (Seu método _getAdjustedWoundingModifiers, sem alterações)
        const baseMods = [ { group: 1, type: "Corte", abrev: "cort", mult: 1.5 }, { group: 1, type: "Perfuração", abrev: "perf", mult: 2 }, { group: 1, type: "Contusão", abrev: "cont", mult: 1 }, { group: 2, type: "Queimadura", abrev: "qmd", mult: 1 }, { group: 2, type: "Corrosão", abrev: "cor", mult: 1 }, { group: 2, type: "Toxina", abrev: "tox", mult: 1 }, { group: 3, type: "Perfurante", abrev: "pi", mult: 1 }, { group: 3, type: "Pouco Perfurante", abrev: "pi-", mult: 0.5 }, { group: 3, type: "Muito Perfurante", abrev: "pi+", mult: 1.5 }, { group: 3, type: "Ext. Perfurante", abrev: "pi++", mult: 2 }, ];
        if (["head", "eyes"].includes(locationKey)) { return baseMods.map(mod => ({ ...mod, mult: mod.abrev === "tox" ? 1 : 4 })); }
        if (locationKey === "face") { return baseMods.map(mod => ({ ...mod, mult: mod.abrev === "cor" ? 1.5 : mod.mult })); }
        if (["arm", "leg", "hand", "foot"].includes(locationKey)) { return baseMods.map(mod => { if (["perf", "pi+", "pi++"].includes(mod.abrev)) return { ...mod, mult: 1 }; return mod; }); }
        if (locationKey === "neck") { return baseMods.map(mod => { if (mod.abrev === "cor" || mod.abrev === "cont") return { ...mod, mult: 1.5 }; if (mod.abrev === "cort") return { ...mod, mult: 2 }; return mod; }); }
        if (locationKey === "vitals") { return baseMods.map(mod => { if (["perf", "pi", "pi-", "pi+", "pi++"].includes(mod.abrev)) return { ...mod, mult: 3 }; return mod; }); }
        return baseMods;
    }
    
    async _updateObject(_event, _formData) {
        // Limpamos os avisos de 'não lido' e mantemos o método vazio.
    }
}