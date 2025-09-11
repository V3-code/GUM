import { applyContingentCondition } from "../main.js";

export default class DamageApplicationWindow extends Application {
    
    constructor(damageData, attackerActor, targetActor, options = {}) {
        super(options);
        this.damageData = damageData;
        this.attackerActor = attackerActor;
        this.targetActor = targetActor;
        
        this.effectState = {};
        this.isApplying = false;

        // ✅ MUDANÇA 1: Adiciona a "memória" para os testes de resistência.
        this.testsProposed = false; 

        // ✅ MUDANÇA 2: Define o título dinâmico aqui, no local correto.
        this.options.title = `Aplicar Dano em ${this.targetActor?.name || "Alvo"}`;

    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            // ✅ MUDANÇA 2: O título aqui agora é genérico.
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

    // ==========================================================
    // SEU BLOCO DE LISTENERS ORIGINAL (100% PRESERVADO)
    // ==========================================================
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
                let htmlContent = newMods.map(mod => `<div class="wounding-row mod-group-${mod.group || 'x'}"><label class="custom-radio"><input type="radio" name="wounding_mod_type" value="${mod.mult}" ${mod.abrev === selectedAbrev ? 'checked' : ''}/><span class="type">${mod.type} (${mod.abrev})</span><span class="dots"></span><span class="mult">x${mod.mult}</span></label></div>`).join('');
                htmlContent += `<hr style="margin-top: 6px; margin-bottom: 6px;">`;
                htmlContent += `<div class="wounding-row"><label class="custom-radio"><input type="radio" name="wounding_mod_type" value="1" ${selectedAbrev === '' ? 'checked' : ''}/><span>Sem Modificador</span><span class="dots"></span><span class="mult">x1</span></label></div>`;
                htmlContent += `<div class="wounding-row"><label class="custom-radio"><input type="radio" name="wounding_mod_type" value="custom"/><span>Outros Mod.:</span><input type="number" name="custom_wounding_mod" value="1" step="0.5" class="custom-mod-input"/></label></div>`;
                modTable.innerHTML = htmlContent;
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

    // ==========================================================
    // BOTÕES DE AÇÃO (ANTIGOS E NOVOS)
    // ==========================================================
    html.find('button[data-action="proposeTests"]').on('click', () => this._onProposeTests(form));
    html.find('button[data-action="applyAndPublish"]').on('click', () => this._onApplyDamage(form, true, true));
    html.find('button[data-action="applyAndClose"]').on('click', () => this._onApplyDamage(form, true, false));
    html.find('button[data-action="applyAndKeepOpen"]').on('click', () => this._onApplyDamage(form, false, false));
    
    // ==========================================================
    // ✅ NOVOS LISTENERS PARA O PAINEL INTERATIVO (ADICIONADOS)
    // ==========================================================
    
       html.on('change', '.apply-effect-checkbox', (ev) => this._onToggleEffect(ev, form));
    
    html.on('click', '.propose-resistance-roll', (ev) => this._onProposeIndividualTest(ev, form));


    // ==========================================================
    // Listeners para CheckBoxes
    // ==========================================================
        html.on('change', '.gcs-checkbox', (ev) => {
        const checkbox = $(ev.currentTarget);
        const label = checkbox.closest('.custom-checkbox');
        // Adiciona ou remove a classe .is-checked na label pai com base no estado do checkbox
        label.toggleClass('is-checked', checkbox.prop('checked'));
    });

    // Força uma checagem inicial para que os checkboxes já marcados apareçam corretamente
    html.find('.gcs-checkbox').trigger('change');
        // --- Disparo Inicial (Preservando sua lógica) ---
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
    let selectedLocationDR = 0;
    const activeRow = form.querySelector('.location-row.active');
    if (activeRow) { if (activeRow.dataset.locationKey === 'custom') { const customInput = activeRow.querySelector('input[name="custom_dr"]'); selectedLocationDR = parseInt(customInput?.value || 0); } else { selectedLocationDR = parseInt(activeRow.dataset.dr || 0); } }
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

    // ✅ **PASSO 1**: Armazenamos a lesão *potencial* em uma variável separada.
    const injuryForEventCheck = finalInjury;

    // ✅ **PASSO 2**: Modificamos a `finalInjury` (que será aplicada) APENAS se a caixa estiver marcada.
    if (effectsOnlyChecked) {
        finalInjury = 0;
    }
    
    this.finalInjury = finalInjury;    

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
 

    // ✅ Bloco de Feedback e Notas (Seu código original, mantido e correto)
    const notesContainer = form.querySelector(".calculation-notes");
    const injuryLabel = form.querySelector(".final-injury-compact label");
    const injuryValue = form.querySelector(".final-injury-compact span");
    let notesHtml = "";

    if (effectsOnlyChecked) {
        notesHtml += `<li class="feedback-note">Apenas efeitos serão aplicados.</li>`;
    }
    if (applyAsHeal) {
        notesHtml += `<li class="feedback-note">O valor final será aplicada como restauração.</li>`;
        if (injuryLabel) { injuryLabel.textContent = "Restauração"; injuryLabel.style.color = "#3b7d3b"; }
        if (injuryValue) { injuryValue.style.color = "#3b7d3b"; }
    } else {
        if (injuryLabel) { injuryLabel.textContent = "Lesão"; injuryLabel.style.color = "#c53434"; }
        if (injuryValue) { injuryValue.style.color = "#c53434"; }
    }

    if (halfDamageChecked) { notesHtml += `<li>1/2D: Dano base reduzido.</li>`; }
    if (explosionChecked && explosionDistance > 0) { const divisor = Math.max(1, 3 * explosionDistance); notesHtml += `<li>Explosão: Dano dividido por ${divisor}.</li>`; }
    if (toleranceType) { const toleranceName = { "nao-vivo": "Não Vivo", "homogeneo": "Homogêneo", "difuso": "Difuso"}[toleranceType]; notesHtml += `<li>Tolerância: ${toleranceName} aplicada.</li>`; }

    if (notesContainer) { notesContainer.innerHTML = notesHtml ? `<ul>${notesHtml}</ul>` : ""; }


    // =========================================================================
    // PARTE FINAL: COLETA E RENDERIZAÇÃO DO PAINEL DE EFEITOS (NOVA LÓGICA)
    // =========================================================================
    
    const eventContext = { damage: injuryForEventCheck, target: this.targetActor, attacker: this.attackerActor };
    const potentialEffects = await this._collectPotentialEffects(eventContext);
    
    // Aponta para o painel de efeitos no seu HBS
    const effectsListEl = form.querySelector(".effects-summary");
    let effectsHTML = "";
    let hasResistibleEffect = false;

    if (potentialEffects.length === 0) {
        effectsHTML = `<div class="placeholder">Nenhum efeito adicional</div>`;
    } else {
        for (const effectInfo of potentialEffects) {
            const { linkId, effectData, sourceName, originalItem } = effectInfo;
            if (!this.effectState[linkId]) {
                this.effectState[linkId] = { checked: true, resultText: null, isSuccess: null, data: effectData, sourceName: sourceName };
            }
            const state = this.effectState[linkId];
            const isResisted = effectData.resistanceRoll?.isResisted;
            if (isResisted && state.checked) hasResistibleEffect = true;

        effectsHTML += `
            <div class="effect-card" data-effect-link-id="${linkId}">
                <div class="effect-main">
                    <label class="custom-checkbox ${state.checked ? 'is-checked' : ''}">
                        <input type="checkbox" class="apply-effect-checkbox" ${state.checked ? 'checked' : ''} />
                        <img src="${effectData.img || originalItem.img}" class="effect-icon" title="Origem: ${sourceName}" />
                        <span class="effect-name">${effectData.name || originalItem.name}</span>
                    </label>
                </div>
                <div class="effect-status ${state.isSuccess === true ? 'success' : state.isSuccess === false ? 'failure' : ''}">
                    ${state.resultText || (isResisted ? `(Pendente: ${effectData.resistanceRoll.attribute.toUpperCase()})` : '(Automático)')}
                </div>
                <div class="effect-controls">
                    ${isResisted ? `<button type="button" class="propose-resistance-roll" data-effect-link-id="${linkId}"><i class="fas fa-dice-d20"></i></button>` : ''}
                </div>
            </div>`;
        }
    }
    effectsListEl.innerHTML = effectsHTML;
    
    const proposeButton = form.querySelector('button[data-action="proposeTests"]');
    if (proposeButton) {
        proposeButton.style.display = hasResistibleEffect ? 'inline-block' : 'none';
        proposeButton.disabled = this.testsProposed;
        if (this.testsProposed) {
            proposeButton.innerHTML = `<i class="fas fa-check"></i> Testes Propostos`;
        } else {
            proposeButton.innerHTML = `<i class="fas fa-dice-d20"></i> Propor Testes`;
        }
    }
}

async _collectPotentialEffects(eventContext) {
    const potentialEffects = [];

    // 1. Coleta efeitos da seção "Ao Causar Dano"
    const onDamageEffects = this.damageData.onDamageEffects || {};
    for (const [id, linkData] of Object.entries(onDamageEffects)) {
        const effectItem = await fromUuid(linkData.effectUuid);
        if (!effectItem) continue;

        // Verifica os parâmetros contextuais
        const minInjury = linkData.minInjury || 1;
        if (eventContext.damage >= minInjury) {
            potentialEffects.push({ 
                linkId: id, 
                effectData: effectItem.system, 
                sourceName: effectItem.name, 
                originalItem: effectItem 
            });
        }
    }

    // 2. Coleta efeitos da seção "Condições Gerais"
    const generalConditions = this.damageData.generalConditions || {};
    for (const [id, linkData] of Object.entries(generalConditions)) {
        const condItem = await fromUuid(linkData.uuid);
        if (!condItem || !condItem.system.when) continue;
        
        let met = false;
        try { 
            met = Function("actor", "event", `return (${condItem.system.when})`)(this.targetActor, eventContext); 
        } catch(e) {
            console.warn(`GUM | Erro ao avaliar gatilho da Condição Geral '${condItem.name}':`, e);
        }
        
        if (met) {
            const innerEffects = Array.isArray(condItem.system.effects) ? condItem.system.effects : Object.values(condItem.system.effects || {});
            innerEffects.forEach((eff, i) => {
                potentialEffects.push({ 
                    linkId: `${id}-${i}`, 
                    effectData: eff, 
                    sourceName: condItem.name, 
                    originalItem: condItem 
                });
            });
        }
    }

    return potentialEffects;
}

_onToggleEffect(event, form) { // ✅ CORREÇÃO: Aceita 'form' como um argumento
    const linkId = $(event.currentTarget).closest('.effect-card').data('effect-link-id');
    if (this.effectState[linkId]) {
        this.effectState[linkId].checked = event.currentTarget.checked;
        
        // ✅ CORREÇÃO: Usa a variável 'form' que recebeu para chamar o recálculo
        this._updateDamageCalculation(form);
    }
}

_onProposeIndividualTest(event, form) { // ✅ CORREÇÃO: Aceita 'form' como argumento
    const linkId = $(event.currentTarget).closest('.effect-card').data('effectLinkId');
    const state = this.effectState[linkId];
    if (!state) return;
    
    const potentialInjury = this._calculatePotentialInjury(form); // ✅ CORREÇÃO: Usa o 'form' recebido
    const eventContext = { damage: potentialInjury, target: this.targetActor, attacker: this.attackerActor };
    this._promptResistanceRoll(state.data, state.sourceName, eventContext, linkId);
}

updateEffectCard(effectLinkId, resultData) {
    const state = this.effectState[effectLinkId];
    if (!state) return;
    
    state.resultText = resultData.resultText;
    state.isSuccess = resultData.isSuccess;
    
    // Se o teste foi um sucesso e a regra é aplicar em falha, desmarca o efeito
    if (resultData.isSuccess && state.data.resistanceRoll.applyOn === 'failure') {
        state.checked = false;
    }
    
    this._updateDamageCalculation(this.form); // Redesenha a lista de efeitos
}

_calculatePotentialInjury(form) {
    const damageRolled = parseFloat(form.querySelector('[name="damage_rolled"]')?.value) || 0;
    const armorDivisor = parseFloat(form.querySelector('[name="armor_divisor"]')?.value) || 1;
    const activeLocationRow = form.querySelector('.location-row.active');
    let selectedDR = 0;
    if (activeLocationRow) {
        if (activeLocationRow.dataset.locationKey === 'custom') {
            selectedDR = parseInt(activeLocationRow.querySelector('input[name="custom_dr"]')?.value || 0);
        } else {
            selectedDR = parseInt(activeLocationRow.dataset.dr || 0);
        }
    }
    const penetratingDamage = Math.max(0, damageRolled - Math.floor(selectedDR / armorDivisor));
    const woundingModRadio = form.querySelector('input[name="wounding_mod_type"]:checked');
    let woundingMod = 1;
    if (woundingModRadio) {
        if (woundingModRadio.value === 'custom') { woundingMod = parseFloat(form.querySelector('[name="custom_wounding_mod"]')?.value) || 1; } 
        else { woundingMod = parseFloat(woundingModRadio.value) || 1; }
    }
    return Math.floor(penetratingDamage * woundingMod);
}

async _onProposeTests(form) {
    // Impede cliques duplicados se os testes já foram propostos
    if (this.testsProposed) {
        return ui.notifications.warn("Os testes de resistência já foram propostos.");
    }
    
    ui.notifications.info("Enviando propostas de teste para o chat...");

    // ✅ CORREÇÃO: Calcula a lesão potencial para garantir o contexto correto para os testes.
    const potentialInjury = this._calculatePotentialInjury(form);
    const eventContext = { damage: potentialInjury, target: this.targetActor, attacker: this.attackerActor };
    let testsProposedCount = 0;

    // ✅ LÓGICA SIMPLIFICADA: Itera diretamente sobre o estado que já preparamos.
    for (const [linkId, state] of Object.entries(this.effectState)) {
        // Propõe o teste apenas se o efeito estiver marcado E for resistível
        if (state.checked && state.data.resistanceRoll?.isResisted) {
            this._promptResistanceRoll(state.data, state.sourceName, eventContext, linkId);
            testsProposedCount++;
        }
    }

    if (testsProposedCount > 0) {
        this.testsProposed = true; // Marca que os testes foram enviados
        // Atualiza a UI para desabilitar o botão e dar feedback
        const proposeButton = this.element.find('button[data-action="proposeTests"]');
        if (proposeButton.length > 0) {
            proposeButton.prop('disabled', true).html('<i class="fas fa-check"></i> Testes Propostos');
        }
    } else {
        ui.notifications.warn("Nenhum efeito resistível foi encontrado para propor.");
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

        if (!selectedPoolPath) {
            this.isApplying = false;
            return ui.notifications.error("Nenhum alvo para o dano foi selecionado.");
        }

        const currentPoolValue = foundry.utils.getProperty(this.targetActor, selectedPoolPath);

        // 1. Aplica o dano ou cura (esta parte está perfeita)
        if (!applyAsHeal && finalInjury > 0 && !effectsOnlyChecked) {
            const eventData = { type: "damage", damage: finalInjury, damageType: this.damageTypeAbrev };
            await this.targetActor.update({ [selectedPoolPath]: currentPoolValue - finalInjury }, { gumEventData: eventData });
        } else if (applyAsHeal && finalInjury > 0) {
            await this.targetActor.update({ [selectedPoolPath]: currentPoolValue + finalInjury });
        }

        // ==========================================================
        // 2. PROCESSA OS EFEITOS (LÓGICA NOVA E CORRIGIDA)
        // ==========================================================
        const appliedEffectSources = new Set(); // Usamos um Set para evitar nomes duplicados no chat

        for (const [linkId, state] of Object.entries(this.effectState)) {
            // Aplica o efeito apenas se:
            // 1. Ele estiver MARCADO na UI.
            // 2. Ele for um efeito AUTOMÁTICO (não tem teste de resistência).
            // 3. OU se o teste de resistência já foi feito e FALHOU.
            if (state.checked && (!state.data.resistanceRoll?.isResisted || state.isSuccess === false)) {
                
                const newConditionData = {
                    name: `Efeito (${state.sourceName}): ${state.data.name || 'Sem Nome'}`,
                    type: "condition",
                    system: {
                        when: "", // Já está ativo
                        effects: [state.data] // Contém apenas este efeito
                    }
                };
                
                await this.targetActor.createEmbeddedDocuments("Item", [newConditionData]);
                
                // Adiciona o nome da FONTE do efeito (a Condição Mista, por exemplo) para o log do chat
                appliedEffectSources.add(state.sourceName);
            }            // ✅ CASO B: Efeito é resistível e o teste AINDA NÃO FOI FEITO -> PROPÕE O TESTE
            else if (state.data.resistanceRoll?.isResisted && state.isSuccess === null) {
                this._promptResistanceRoll(state.data, state.sourceName, eventContext, linkId);
                appliedEffectSources.add(state.sourceName); // Adiciona ao log, pois a tentativa de aplicação ocorreu
            }
        }

        // 3. Publica o resultado no chat
        if (shouldPublish) {
            const poolLabel = form.querySelector('[name="damage_target_pool"] option:checked').textContent;
            let resultLine = '';
            
            // A lógica para a linha de resultado está correta
            if (applyAsHeal && finalInjury > 0) {
                resultLine = `<p>Recuperou <strong>${finalInjury} em ${poolLabel}</strong>.</p>`;
            } else if (finalInjury > 0 && !effectsOnlyChecked) {
                resultLine = `<p>Sofreu <strong>${finalInjury} de lesão</strong> em ${poolLabel}.</p>`;
            } else if (finalInjury === 0 && effectsOnlyChecked && appliedEffectSources.size > 0) {
                resultLine = `<p>Não sofreu lesão, mas foi afetado por condições.</p>`;
            }
            
            // ✅ CORREÇÃO: Usa a variável 'appliedEffectSources' e a converte para um array para o .map()
            let effectsHtml = appliedEffectSources.size > 0
                ? `<div class="minicard effects-card"><div class="minicard-title">Condições Ativadas</div>${Array.from(appliedEffectSources).map(name => `<p><strong>${name}</strong></p>`).join('')}</div>`
                : '';
            
            // O restante do código para montar a mensagem está correto
            let messageContent = `
            <div class="gurps-roll-card">
                <header class="card-header"><h3>Resumo do Ataque</h3></header>
                <div class="card-content">
                    <div class="summary-actors vertical">
                         <div class="actor-line"><img src="${this.attackerActor.img}" class="actor-token-icon"> <strong>${this.attackerActor.name}</strong></div>
                        <div class="arrow-line"><i class="fas fa-arrow-down"></i></div>
                        <div class="actor-line"><img src="${this.targetActor.img}" class="actor-token-icon"> <strong>${this.targetActor.name}</strong></div>
                    </div>
                    ${resultLine ? `<div class="minicard result-card"><div class="minicard-title">Resultado</div>${resultLine}</div>` : ''}
                    ${effectsHtml}
                </div>
            </div>`;

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

async _promptResistanceRoll(effectData, sourceConditionName, eventContext, linkId) {
    const rollData = effectData.resistanceRoll;
    const target = eventContext.target;
    
    let baseAttributeValue = getProperty(target.system.attributes, `${rollData.attribute}.final`);
    
    if (baseAttributeValue === undefined || baseAttributeValue === null) {
        console.warn(`GUM | Não foi possível encontrar o valor para 'system.attributes.${rollData.attribute}.final'. Usando 10 como padrão.`);
        baseAttributeValue = 10;
    }
    
    let totalModifier = parseInt(rollData.modifier) || 0;
    const finalTarget = baseAttributeValue + totalModifier;

    // ✅ CORREÇÃO: Adicionamos o 'effectLinkId' ao pacote de dados.
    // Esta é a "ponte" de volta para a janela de aplicação de dano.
    const chatButtonPayload = {
        targetActorId: target.id,
        finalTarget: finalTarget,
        sourceConditionName: sourceConditionName,
        effectData: effectData,
        effectLinkId: linkId 
    };

    const content = `<div class="gurps-resistance-roll-card">
        <p><strong>${target.name}</strong> precisa resistir ao efeito "${effectData.name}" de <strong>${sourceConditionName}</strong>!</p>
        <p>Faça um teste de <strong>${rollData.attribute.toUpperCase()}</strong> para evitar o efeito.</p>
        <button type="button" class="resistance-roll-button" data-roll-data='${JSON.stringify(chatButtonPayload)}'>
            <i class="fas fa-dice-d6"></i> Rolar Teste de Resistência (vs ${finalTarget})
        </button>
    </div>`;
    
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